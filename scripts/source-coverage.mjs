import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function unquote(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function decodeXml(value = '') {
  return value
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

function tag(block, name) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

export function parsePriorityFeeds(yaml) {
  const blocks = yaml.split(/\n(?=\s{2}- id:\s*)/);
  const sources = [];
  for (const block of blocks) {
    const id = block.match(/^\s*- id:\s*(.+)$/m)?.[1];
    if (!id || !/^\s+coverage_priority:\s*true\s*$/m.test(block)) continue;
    const method = block.match(/^\s+method:\s*(.+)$/m)?.[1];
    if (unquote(method || '') !== 'rss') continue;
    const name = block.match(/^\s+name:\s*(.+)$/m)?.[1];
    const url = block.match(/^\s+url:\s*(.+)$/m)?.[1];
    const filterBlock = block.match(/^\s+filters:\s*$\n((?:\s+-\s+.+(?:\n|$))*)/m)?.[1] || '';
    const filters = [...filterBlock.matchAll(/^\s+-\s+(.+)$/gm)].map((match) => unquote(match[1]));
    if (!name || !url) throw new Error(`Priority source ${unquote(id)} is missing name or url`);
    sources.push({
      id: unquote(id),
      name: unquote(name),
      method: 'rss',
      url: unquote(url),
      filters,
    });
  }
  return sources;
}

export function parseFeedItems(xml) {
  const rssItems = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);
  const atomItems = [...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)].map((match) => match[1]);
  return [...rssItems, ...atomItems].map((block) => {
    const atomLink = block.match(/<link\s[^>]*href=["']([^"']+)["'][^>]*\/?\s*>/i)?.[1] || '';
    const dateValue = tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated');
    const date = new Date(dateValue);
    if (!dateValue || Number.isNaN(date.getTime())) return null;
    return {
      title: tag(block, 'title'),
      url: tag(block, 'link') || decodeXml(atomLink),
      published_at: date.toISOString().slice(0, 10),
    };
  }).filter((item) => item && item.title && item.url);
}

export function buildCoverageLedger({ sources, feeds, start, end }) {
  const entries = [];
  const seen = new Set();
  for (const source of sources) {
    for (const item of feeds.get(source.id) || []) {
      if (source.filters?.length && !source.filters.some((filter) => item.title.toLowerCase().includes(filter.toLowerCase()))) continue;
      if (item.published_at < start || item.published_at > end || seen.has(item.url)) continue;
      seen.add(item.url);
      entries.push({
        source_id: source.id,
        source_name: source.name,
        title: item.title,
        url: item.url,
        published_at: item.published_at,
        decision: 'pending',
        reason: '',
      });
    }
  }
  entries.sort((a, b) => a.published_at.localeCompare(b.published_at) || a.source_id.localeCompare(b.source_id) || a.title.localeCompare(b.title));
  return { version: 1, coverage: { start, end }, entries };
}

export function verifyCoverageLedger(ledger) {
  if (ledger?.version !== 1 || !ledger.coverage?.start || !ledger.coverage?.end || !Array.isArray(ledger.entries)) {
    throw new Error('Invalid source coverage ledger');
  }
  for (const entry of ledger.entries) {
    if (entry.decision === 'pending') throw new Error(`Entry remains pending review: ${entry.title}`);
    if (!['included', 'excluded'].includes(entry.decision)) throw new Error(`Invalid decision for ${entry.title}`);
    if (entry.decision === 'excluded' && !entry.reason?.trim()) throw new Error(`Missing exclusion reason for ${entry.title}`);
  }
  return true;
}

async function collect({ sourcesPath, start, end, outPath }) {
  const sources = parsePriorityFeeds(await readFile(sourcesPath, 'utf8'));
  const feeds = new Map();
  for (const source of sources) {
    const response = await fetch(source.url, { headers: { 'user-agent': 'weekly-ai-newsletter-source-audit/1.0' } });
    if (!response.ok) throw new Error(`${source.id} returned HTTP ${response.status}`);
    feeds.set(source.id, parseFeedItems(await response.text()));
  }
  const ledger = buildCoverageLedger({ sources, feeds, start, end });
  await writeFile(outPath, `${JSON.stringify(ledger, null, 2)}\n`);
  return ledger;
}

function argument(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main(args) {
  const command = args[0];
  if (command === 'collect') {
    const start = argument(args, '--start');
    const end = argument(args, '--end');
    const outPath = argument(args, '--out');
    const sourcesPath = argument(args, '--sources') || resolve('config/sources.yml');
    if (!start || !end || !outPath) throw new Error('Usage: source-coverage.mjs collect --start YYYY-MM-DD --end YYYY-MM-DD --out PATH');
    const ledger = await collect({ sourcesPath, start, end, outPath });
    console.log(JSON.stringify({ ok: true, entries: ledger.entries.length, out: outPath }));
    return;
  }
  if (command === 'verify') {
    const path = args[1];
    if (!path) throw new Error('Usage: source-coverage.mjs verify PATH');
    verifyCoverageLedger(JSON.parse(await readFile(path, 'utf8')));
    console.log(JSON.stringify({ ok: true, path }));
    return;
  }
  throw new Error('Usage: source-coverage.mjs <collect|verify>');
}

const direct = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (direct) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
