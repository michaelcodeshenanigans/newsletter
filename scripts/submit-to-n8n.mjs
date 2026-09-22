#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateIssue } from '../publisher/newsletter.mjs';

export function parseEnv(content) {
  const values = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) throw new Error(`Invalid configuration line: ${rawLine}`);
    values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return values;
}

export function buildSubmission(issue, config, { publish = false } = {}) {
  for (const key of ['NEWSLETTER_WEBHOOK_URL', 'NEWSLETTER_WEBHOOK_HEADER', 'NEWSLETTER_WEBHOOK_TOKEN']) {
    if (!config[key]) throw new Error(`Missing ${key}`);
  }
  return {
    url: config.NEWSLETTER_WEBHOOK_URL,
    options: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [config.NEWSLETTER_WEBHOOK_HEADER]: config.NEWSLETTER_WEBHOOK_TOKEN,
      },
      body: JSON.stringify({ mode: publish ? 'publish' : 'dry_run', issue }),
    },
  };
}

export function isDirectExecution(metaUrl, argv1) {
  return Boolean(argv1 && resolve(fileURLToPath(metaUrl)) === resolve(argv1));
}

export function decodePublisherResponse(body) {
  if (!body.trim()) throw new Error('Publisher returned an empty response');
  try {
    return JSON.parse(body);
  } catch {
    throw new Error('Publisher returned invalid JSON');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const publish = args.includes('--publish');
  const issuePath = args.find((arg) => !arg.startsWith('--'));
  if (!issuePath) throw new Error('Usage: submit-to-n8n.mjs <issue.json> [--publish]');
  const issue = JSON.parse(readFileSync(resolve(issuePath), 'utf8'));
  validateIssue(issue);
  const configPath = process.env.NEWSLETTER_PUBLISHER_ENV || resolve(homedir(), '.config/newsletter/publisher.env');
  const config = parseEnv(readFileSync(configPath, 'utf8'));
  const request = buildSubmission(issue, config, { publish });
  const response = await fetch(request.url, request.options);
  const body = await response.text();
  if (!response.ok) throw new Error(`Publisher returned HTTP ${response.status}: ${body}`);
  console.log(JSON.stringify(decodePublisherResponse(body), null, 2));
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
