import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkflow } from '../publisher/build-workflow.mjs';
import { render } from '../publisher/n8n-render.js';
import { issueContentHash } from '../publisher/newsletter.mjs';
import { validIssue } from './helpers.mjs';

test('workflow has one authenticated webhook, a dry-run response, and an atomic Git Data API publish branch', () => {
  const workflow = buildWorkflow({
    githubCredentialId: 'github-credential-id',
    webhookCredentialId: 'webhook-credential-id',
  });

  assert.equal(workflow.active, false);
  assert.equal(workflow.name, 'Weekly AI Newsletter Publisher');
  assert.equal(workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.webhook').length, 1);
  assert.ok(workflow.nodes.some((node) => node.name === 'Dry Run Response'));
  assert.ok(workflow.nodes.some((node) => node.name === 'Create Git Tree'));
  assert.ok(workflow.nodes.some((node) => node.name === 'Create Git Commit'));
  assert.ok(workflow.nodes.some((node) => node.name === 'Update Main Ref'));
  assert.ok(workflow.nodes.some((node) => node.name === 'Verify Published Ref'));
  assert.equal(workflow.nodes.some((node) => node.type === 'n8n-nodes-base.scheduleTrigger'), false);

  const webhook = workflow.nodes.find((node) => node.type === 'n8n-nodes-base.webhook');
  assert.equal(webhook.parameters.authentication, 'headerAuth');
  assert.equal(webhook.credentials.httpHeaderAuth.id, 'webhook-credential-id');

  for (const nodeName of ['Get Manifest', 'Get Main Ref', 'Get Main Commit', 'Create Git Blobs', 'Create Git Tree', 'Create Git Commit', 'Update Main Ref']) {
    const node = workflow.nodes.find((candidate) => candidate.name === nodeName);
    assert.equal(node.credentials.githubApi.id, 'github-credential-id');
  }
  assert.equal(workflow.connections['Validate Request'].main[0][0].node, 'Get Main Ref');
  assert.equal(workflow.connections['Get Main Ref'].main[0][0].node, 'Get Main Commit');
  assert.equal(workflow.connections['Get Main Commit'].main[0][0].node, 'Get Manifest');
});

test('workflow render code performs strict validation and returns the five deterministic publication files', () => {
  const workflow = buildWorkflow({ githubCredentialId: 'g', webhookCredentialId: 'w' });
  const render = workflow.nodes.find((node) => node.name === 'Validate and Render');
  assert.match(render.parameters.jsCode, /undeclared citation/i);
  assert.match(render.parameters.jsCode, /issues\/manifest\.json/);
  assert.match(render.parameters.jsCode, /feed\.xml/);
  assert.match(render.parameters.jsCode, /artifacts\//);
});

test('n8n renderer accepts Unicode and computes the same SHA-256 as the local validator', async () => {
  const issue = validIssue({
    summary: 'A source-grounded dry-run issue covering material AI changes — including multilingual text such as שלום — and operational implications.',
  });
  const manifest = Buffer.from(JSON.stringify({ version: 1, issues: [] })).toString('base64');
  const $input = { first: () => ({ json: { content: manifest } }) };
  const $ = (name) => ({
    first: () => ({ json: name === 'Validate Request' ? { mode: 'dry_run', issue } : {} }),
  });
  const [result] = await render($input, $);
  assert.equal(result.json.content_hash, issueContentHash(issue));
});

test('n8n renderer enforces initial revision 1 and contiguous corrections', async () => {
  const run = async (issue, issues) => {
    const manifest = Buffer.from(JSON.stringify({ version: 1, issues })).toString('base64');
    const $input = { first: () => ({ json: { content: manifest } }) };
    const $ = () => ({ first: () => ({ json: { mode: 'dry_run', issue } }) });
    return render($input, $);
  };

  await assert.rejects(() => run(validIssue({ revision: 2 }), []), /initial revision must be 1/i);
  await assert.rejects(
    () => run(validIssue({ revision: 3 }), [{ issue_id: '2026-09-22', revision: 1, content_hash: 'old' }]),
    /must be 2/i,
  );
});
