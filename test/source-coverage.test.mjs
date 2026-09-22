import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCoverageLedger,
  parseFeedItems,
  parsePriorityFeeds,
  verifyCoverageLedger,
} from '../scripts/source-coverage.mjs';

const registry = `
sources:
  - id: ordinary-feed
    name: Ordinary Feed
    method: rss
    url: "https://example.com/ordinary.xml"

  - id: agentcore-feed
    name: AgentCore Feed
    method: rss
    coverage_priority: true
    url: "https://example.com/agentcore.xml"
    filters:
      - AgentCore
      - Bedrock

  - id: priority-page
    name: Priority Page
    method: page-diff
    coverage_priority: true
    url: "https://example.com/page"
`;

const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <item>
    <title>The new AgentCore runtime: Elastic &amp; fast</title>
    <link>https://example.com/runtime</link>
    <pubDate>Fri, 18 Sep 2026 15:31:34 +0000</pubDate>
  </item>
  <item>
    <title>Outside the window</title>
    <link>https://example.com/old</link>
    <pubDate>Tue, 15 Sep 2026 10:00:00 +0000</pubDate>
  </item>
  <item>
    <title>In-window but unrelated database launch</title>
    <link>https://example.com/unrelated</link>
    <pubDate>Fri, 18 Sep 2026 16:00:00 +0000</pubDate>
  </item>
</channel></rss>`;

test('priority feed collection enumerates every in-window item and starts unresolved', () => {
  const sources = parsePriorityFeeds(registry);
  assert.deepEqual(sources, [{
    id: 'agentcore-feed',
    name: 'AgentCore Feed',
    method: 'rss',
    url: 'https://example.com/agentcore.xml',
    filters: ['AgentCore', 'Bedrock'],
  }]);

  const items = parseFeedItems(feed);
  assert.equal(items[0].title, 'The new AgentCore runtime: Elastic & fast');

  const ledger = buildCoverageLedger({
    sources,
    feeds: new Map([['agentcore-feed', items]]),
    start: '2026-09-16',
    end: '2026-09-22',
  });

  assert.equal(ledger.entries.length, 1);
  assert.equal(ledger.entries[0].url, 'https://example.com/runtime');
  assert.equal(ledger.entries[0].published_at, '2026-09-18');
  assert.equal(ledger.entries[0].decision, 'pending');
  assert.throws(() => verifyCoverageLedger(ledger), /pending review/);
});

test('coverage verification requires a reason for exclusions and accepts resolved entries', () => {
  const base = {
    version: 1,
    coverage: { start: '2026-09-16', end: '2026-09-22' },
    entries: [{
      source_id: 'agentcore-feed',
      source_name: 'AgentCore Feed',
      title: 'Runtime launch',
      url: 'https://example.com/runtime',
      published_at: '2026-09-18',
      decision: 'excluded',
      reason: '',
    }],
  };

  assert.throws(() => verifyCoverageLedger(base), /exclusion reason/);
  base.entries[0].reason = 'Duplicate of the included primary launch announcement.';
  assert.equal(verifyCoverageLedger(base), true);
  base.entries[0].decision = 'included';
  base.entries[0].reason = '';
  assert.equal(verifyCoverageLedger(base), true);
});
