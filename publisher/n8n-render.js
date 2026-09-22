export async function render($input, $) {
const envelope = $('Validate Request').first().json;
const manifestResponse = $input.first().json;

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function text(value, field, min = 1) { assert(typeof value === 'string' && value.trim().length >= min, `${field} is invalid`); }
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}
function https(value) { return typeof value === 'string' && /^https:\/\/[^\s]+$/i.test(value); }
function esc(value) { return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

// Compact synchronous SHA-256 implementation for deterministic idempotency.
function sha256(ascii) {
  function rightRotate(value, amount) { return (value >>> amount) | (value << (32 - amount)); }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const lengthProperty = 'length';
  let i, j;
  let result = '';
  const words = [];
  const asciiBitLength = ascii[lengthProperty] * 8;
  let hash = sha256.h = sha256.h || [];
  const k = sha256.k = sha256.k || [];
  let primeCounter = k[lengthProperty];
  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) isComposite[i] = candidate;
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  ascii += '\x80';
  while (ascii[lengthProperty] % 64 - 56) ascii += '\x00';
  for (i = 0; i < ascii[lengthProperty]; i++) {
    j = ascii.charCodeAt(i);
    assert(j >> 8 === 0, 'Issue JSON must use UTF-8 characters supported by the renderer');
    words[i >> 2] |= j << ((3 - i) % 4) * 8;
  }
  words[words[lengthProperty]] = ((asciiBitLength / maxWord) | 0);
  words[words[lengthProperty]] = (asciiBitLength);
  for (j = 0; j < words[lengthProperty];) {
    const w = words.slice(j, j += 16);
    const oldHash = hash.slice(0);
    hash = hash.slice(0, 8);
    for (i = 0; i < 64; i++) {
      const i2 = i + j;
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = hash[0], e = hash[4];
      const temp1 = hash[7]
        + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
        + ((e & hash[5]) ^ ((~e) & hash[6]))
        + k[i]
        + (w[i] = i < 16 ? w[i] : (w[i - 16]
          + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
          + w[i - 7]
          + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) | 0);
      const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
        + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
      hash.pop();
    }
    for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
  }
  for (i = 0; i < 8; i++) {
    for (j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

const issue = envelope.issue;
const statuses = new Set(['ga','preview','limited','open_source','announced_dated','announced_undated','unconfirmed']);
const confidences = new Set(['high','medium','low']);
const efforts = new Set(['low','medium','high']);
const sourceTypes = new Set(['primary','paper','official-project','government','secondary']);
const impactAreas = new Set(['architecture','deployment','reliability','observability','security','governance','cost','developer-workflow','data-residency','vendor-coupling']);
assert(issue && typeof issue === 'object', 'issue must be an object');
assert(issue.schema_version === 'newsletter.v1', 'schema_version must be newsletter.v1');
assert(/^\d{4}-\d{2}-\d{2}$/.test(issue.issue_id || ''), 'issue_id must use YYYY-MM-DD');
assert(Number.isInteger(issue.revision) && issue.revision >= 1, 'revision must be a positive integer');
assert(typeof issue.generated_at === 'string' && !Number.isNaN(Date.parse(issue.generated_at)) && /T/.test(issue.generated_at), 'generated_at must be an ISO date-time');
assert(issue.timezone === 'Asia/Jerusalem', 'timezone must be Asia/Jerusalem');
assert(issue.coverage && date(issue.coverage.start) && date(issue.coverage.end), 'coverage dates are invalid');
assert(issue.coverage.start <= issue.coverage.end, 'coverage start is after coverage end');
assert(issue.issue_id === issue.coverage.end, 'issue_id must equal coverage end');
text(issue.title, 'title', 10);
text(issue.summary, 'summary', 40);
text(issue.telegram_text, 'telegram_text', 200);
assert(Array.isArray(issue.citations) && issue.citations.length >= 3, 'at least three citations are required');
const cited = new Set();
for (const [index, source] of issue.citations.entries()) {
  assert(/^src-\d{2,3}$/.test(source.id || ''), `citations[${index}].id is invalid`);
  assert(!cited.has(source.id), `duplicate citation ${source.id}`);
  cited.add(source.id);
  text(source.title, `citations[${index}].title`, 3);
  text(source.publisher, `citations[${index}].publisher`, 2);
  assert(https(source.url), `citations[${index}].url must be HTTPS`);
  assert(source.published_at === null || date(source.published_at), `citations[${index}].published_at is invalid`);
  assert(sourceTypes.has(source.source_type), `citations[${index}].source_type is invalid`);
}
function citationIds(ids, field) {
  assert(Array.isArray(ids) && ids.length, `${field} must not be empty`);
  for (const id of ids) assert(cited.has(id), `${field} references undeclared citation ${id}`);
}
assert(Array.isArray(issue.developments) && issue.developments.length >= 3 && issue.developments.length <= 6, 'developments must have 3 to 6 items');
for (const [index, item] of issue.developments.entries()) {
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id || ''), `developments[${index}].id is invalid`);
  text(item.title, `developments[${index}].title`, 8);
  assert(statuses.has(item.status), `developments[${index}].status is invalid`);
  assert(date(item.event_date), `developments[${index}].event_date is invalid`);
  assert(item.event_date >= issue.coverage.start && item.event_date <= issue.coverage.end, `developments[${index}].event_date is outside coverage`);
  for (const key of ['what_changed','why_it_matters','platform_impact','recommended_action','watchouts']) text(item[key], `developments[${index}].${key}`, 5);
  assert(confidences.has(item.confidence), `developments[${index}].confidence is invalid`);
  assert(Number.isInteger(item.score) && item.score >= 0 && item.score <= 21, `developments[${index}].score is invalid`);
  citationIds(item.citation_ids, `developments[${index}].citation_ids`);
}
assert(Array.isArray(issue.devops_impacts) && issue.devops_impacts.length >= 2, 'at least two DevOps impacts are required');
issue.devops_impacts.forEach((item, index) => { text(item.text, `devops_impacts[${index}].text`, 20); citationIds(item.citation_ids, `devops_impacts[${index}].citation_ids`); });
assert(Array.isArray(issue.bring_to_work) && issue.bring_to_work.length >= 2, 'at least two bring-to-work items are required');
issue.devops_impacts.forEach((item, index) => assert(impactAreas.has(item.area), `devops_impacts[${index}].area is invalid`));
issue.bring_to_work.forEach((item, index) => { text(item.title, `bring_to_work[${index}].title`, 4); text(item.what, `bring_to_work[${index}].what`, 10); text(item.fit, `bring_to_work[${index}].fit`, 10); text(item.next_step, `bring_to_work[${index}].next_step`, 10); assert(efforts.has(item.effort), `bring_to_work[${index}].effort is invalid`); citationIds(item.citation_ids, `bring_to_work[${index}].citation_ids`); });
assert(Array.isArray(issue.watchouts) && issue.watchouts.length >= 1, 'at least one watchout is required');
issue.watchouts.forEach((item, index) => { text(item.text, `watchouts[${index}].text`, 10); citationIds(item.citation_ids, `watchouts[${index}].citation_ids`); });

let manifest = { version: 1, issues: [] };
if (manifestResponse && typeof manifestResponse.content === 'string') {
  manifest = JSON.parse(Buffer.from(manifestResponse.content.replace(/\n/g, ''), 'base64').toString('utf8'));
}
if (!Array.isArray(manifest.issues)) manifest = { version: 1, issues: [] };

const byId = new Map(issue.citations.map((source) => [source.id, source]));
const links = (ids) => ids.map((id) => `[${id}](${byId.get(id).url})`).join(' ');
const markdown = ['---', `title: "${issue.title.replaceAll('"','\\"')}"`, `date: ${issue.generated_at}`, `issue_id: ${issue.issue_id}`, `revision: ${issue.revision}`, '---', '', `# ${issue.title}`, '', `_${issue.coverage.start} through ${issue.coverage.end} · Revision ${issue.revision}_`, '', issue.summary, '', '## What changed', ''];
for (const item of issue.developments) {
  markdown.push(`### ${item.title}`, '', `**Status:** ${item.status.replaceAll('_',' ')} · **Event date:** ${item.event_date} · **Confidence:** ${item.confidence} · **Score:** ${item.score}/21`, '', `**What changed:** ${item.what_changed}`, '', `**Why it matters:** ${item.why_it_matters}`, '', `**Platform impact:** ${item.platform_impact}`, '', `**Recommended action:** ${item.recommended_action}`, '', `**Watchouts:** ${item.watchouts}`, '', `Sources: ${links(item.citation_ids)}`, '');
}
markdown.push('## DevOps / platform impact', '');
for (const item of issue.devops_impacts) markdown.push(`- **${item.area}:** ${item.text} ${links(item.citation_ids)}`);
markdown.push('', '## Bring to work', '');
for (const item of issue.bring_to_work) markdown.push(`### ${item.title}`, '', item.what, '', `- **Fit:** ${item.fit}`, `- **Effort:** ${item.effort}`, `- **Next step:** ${item.next_step}`, `- **Sources:** ${links(item.citation_ids)}`, '');
markdown.push('## Watchouts', '');
for (const item of issue.watchouts) markdown.push(`- ${item.text} ${links(item.citation_ids)}`);
markdown.push('', '## Sources', '');
for (const source of issue.citations) markdown.push(`- **${source.id}:** [${source.title}](${source.url}), ${source.publisher}${source.published_at ? ` — ${source.published_at}` : ''} (${source.source_type})`);
markdown.push('');

const contentHash = sha256(unescape(encodeURIComponent(stable(issue))));
const old = manifest.issues.find((entry) => entry.issue_id === issue.issue_id);
if (!old && issue.revision !== 1) fail(`initial revision must be 1 for issue ${issue.issue_id}`);
if (old && !(old.revision === issue.revision && old.content_hash === contentHash) && issue.revision !== old.revision + 1) {
  fail(`next revision for issue ${issue.issue_id} must be ${old.revision + 1}`);
}
const entry = { issue_id: issue.issue_id, revision: issue.revision, title: issue.title, coverage: issue.coverage, published_at: issue.generated_at, path: `issues/${issue.issue_id}.md`, content_hash: contentHash };
const noop = Boolean(old && old.revision === issue.revision && old.content_hash === contentHash);
manifest.version = 1;
manifest.issues = manifest.issues.filter((item) => item.issue_id !== issue.issue_id).concat(entry).sort((a,b) => b.issue_id.localeCompare(a.issue_id));
const site = 'https://michaelcodeshenanigans.github.io/newsletter';
const indexItems = manifest.issues.map((item) => `<article><h2><a href="${site}/issues/${esc(item.issue_id)}.html">${esc(item.title)}</a></h2><p>${esc(item.coverage.start)} through ${esc(item.coverage.end)} · Revision ${item.revision}</p></article>`).join('');
const indexHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Weekly AI &amp; Agentic Systems Newsletter</title><link rel="alternate" type="application/rss+xml" title="Newsletter RSS" href="${site}/feed.xml"><style>body{max-width:52rem;margin:3rem auto;padding:0 1rem;font:18px/1.6 system-ui,sans-serif;color:#18202a}a{color:#0757a6}article{border-top:1px solid #d8dee8;padding:1rem 0}small{color:#566}</style></head><body><header><h1>Weekly AI &amp; Agentic Systems Newsletter</h1><p>Source-grounded changes, operational implications, and practical evaluation candidates.</p></header><main>${indexItems || '<p>No issues have been published yet.</p>'}</main><footer><small><a href="feed.xml">RSS feed</a> · <a href="https://github.com/michaelcodeshenanigans/newsletter">Source repository</a></small></footer></body></html>\n`;
const rssItems = manifest.issues.slice(0,20).map((item) => `<item><title>${esc(item.title)}</title><link>${site}/issues/${item.issue_id}.html</link><guid isPermaLink="true">${site}/issues/${item.issue_id}.html</guid><pubDate>${new Date(item.published_at).toUTCString()}</pubDate><description>${esc(`Coverage ${item.coverage.start} through ${item.coverage.end}.`)}</description></item>`).join('');
const rss = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Weekly AI &amp; Agentic Systems Newsletter</title><link>${site}/</link><description>Source-grounded AI and agentic systems intelligence.</description><language>en-us</language>${rssItems}</channel></rss>\n`;
const files = [
  { path: entry.path, content: `${markdown.join('\n')}\n` },
  { path: `artifacts/${issue.issue_id}.v${issue.revision}.json`, content: `${JSON.stringify(issue,null,2)}\n` },
  { path: 'issues/manifest.json', content: `${JSON.stringify(manifest,null,2)}\n` },
  { path: 'index.html', content: indexHtml },
  { path: 'feed.xml', content: rss },
];
return [{ json: { mode: envelope.mode, issue_id: issue.issue_id, revision: issue.revision, content_hash: contentHash, noop, files, commit_message: `publish: newsletter ${issue.issue_id} v${issue.revision}` } }];
}
