import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { render } from './n8n-render.js';

const REPO_API = 'https://api.github.com/repos/michaelcodeshenanigans/newsletter';

function httpNode({ name, position, method = 'GET', url, jsonBody, githubCredentialId }) {
  const parameters = {
    method,
    url,
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'githubApi',
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: 'Accept', value: 'application/vnd.github+json' },
        { name: 'X-GitHub-Api-Version', value: '2022-11-28' },
      ],
    },
    options: {},
  };
  if (jsonBody) {
    parameters.sendBody = true;
    parameters.specifyBody = 'json';
    parameters.jsonBody = jsonBody;
  }
  return {
    parameters,
    id: crypto.randomUUID(),
    name,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.5,
    position,
    credentials: { githubApi: { id: githubCredentialId, name: 'Newsletter GitHub API' } },
  };
}

function codeNode(name, position, jsCode) {
  return {
    parameters: { mode: 'runOnceForAllItems', jsCode },
    id: crypto.randomUUID(),
    name,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position,
  };
}

function respondNode(name, position, responseBody, responseCode = 200) {
  return {
    parameters: {
      respondWith: 'json',
      responseBody,
      options: { responseCode, enableStreaming: false },
    },
    id: crypto.randomUUID(),
    name,
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1.5,
    position,
  };
}

function ifNode(name, position, leftValue, rightValue, type = 'string') {
  return {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{
          id: crypto.randomUUID(),
          leftValue,
          rightValue,
          operator: { type, operation: 'equals' },
        }],
        combinator: 'and',
      },
      options: {},
    },
    id: crypto.randomUUID(),
    name,
    type: 'n8n-nodes-base.if',
    typeVersion: 2.3,
    position,
  };
}

export function buildWorkflow({ githubCredentialId, webhookCredentialId }) {
  if (!githubCredentialId || !webhookCredentialId) throw new Error('Both credential IDs are required');
  const renderCode = `return await (${render.toString()})($input, $);`;
  const nodes = [
    {
      parameters: {
        httpMethod: 'POST',
        path: 'weekly-ai-newsletter-v1',
        authentication: 'headerAuth',
        responseMode: 'responseNode',
        options: {},
      },
      id: crypto.randomUUID(),
      name: 'Newsletter Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2.1,
      position: [-1080, 0],
      webhookId: '1f82fbb9-d457-49c9-8ae8-e2f9bff2e161',
      credentials: { httpHeaderAuth: { id: webhookCredentialId, name: 'Newsletter Webhook Header' } },
    },
    codeNode('Validate Request', [-860, 0], `
const incoming = $input.first().json;
const body = incoming.body ?? incoming;
if (!body || typeof body !== 'object' || !body.issue) throw new Error('Request body must contain issue');
const mode = body.mode ?? 'dry_run';
if (!['dry_run', 'publish'].includes(mode)) throw new Error('mode must be dry_run or publish');
return [{ json: { mode, issue: body.issue } }];`),
    httpNode({
      name: 'Get Main Ref',
      position: [-640, 0],
      url: `${REPO_API}/git/ref/heads/main`,
      githubCredentialId,
    }),
    httpNode({
      name: 'Get Main Commit',
      position: [-420, 0],
      url: `=${REPO_API}/git/commits/{{ $json.object.sha }}`,
      githubCredentialId,
    }),
    httpNode({
      name: 'Get Manifest',
      position: [-200, 0],
      url: `=${REPO_API}/contents/issues/manifest.json?ref={{ $('Get Main Ref').first().json.object.sha }}`,
      githubCredentialId,
    }),
    codeNode('Validate and Render', [20, 0], renderCode),
    ifNode('Dry Run?', [240, 0], '={{ $json.mode }}', 'dry_run'),
    respondNode('Dry Run Response', [480, -140], "={{ { ok: true, status: 'dry_run', dry_run: true, issue_id: $json.issue_id, revision: $json.revision, content_hash: $json.content_hash, base_commit_sha: $('Get Main Ref').first().json.object.sha, would_publish: !$json.noop, noop: $json.noop, files: $json.files.map((file) => ({ path: file.path, bytes: file.content.length })) } }}"),
    ifNode('Already Published?', [480, 120], '={{ $json.noop }}', true, 'boolean'),
    respondNode('Already Published Response', [720, 20], '={{ { ok: true, status: "idempotent_noop", dry_run: false, noop: true, issue_id: $json.issue_id, revision: $json.revision, content_hash: $json.content_hash } }}'),
    codeNode('Expand Files', [720, 220], `
const files = $('Validate and Render').first().json.files;
return files.map((file) => ({ json: file }));`),
    httpNode({
      name: 'Create Git Blobs',
      position: [940, 220],
      method: 'POST',
      url: `${REPO_API}/git/blobs`,
      jsonBody: "={{ { content: $json.content, encoding: 'utf-8' } }}",
      githubCredentialId,
    }),
    codeNode('Assemble Git Tree', [1160, 220], `
const blobs = $input.all();
const files = $('Expand Files').all();
if (blobs.length !== files.length) throw new Error('Blob response count does not match publication file count');
return [{ json: { tree: blobs.map((blob, index) => ({ path: files[index].json.path, mode: '100644', type: 'blob', sha: blob.json.sha })) } }];`),
    httpNode({
      name: 'Create Git Tree',
      position: [1380, 220],
      method: 'POST',
      url: `${REPO_API}/git/trees`,
      jsonBody: "={{ { base_tree: $('Get Main Commit').first().json.tree.sha, tree: $json.tree } }}",
      githubCredentialId,
    }),
    httpNode({
      name: 'Create Git Commit',
      position: [1600, 220],
      method: 'POST',
      url: `${REPO_API}/git/commits`,
      jsonBody: "={{ { message: $('Validate and Render').first().json.commit_message, tree: $json.sha, parents: [ $('Get Main Ref').first().json.object.sha ] } }}",
      githubCredentialId,
    }),
    httpNode({
      name: 'Update Main Ref',
      position: [1820, 220],
      method: 'PATCH',
      url: `${REPO_API}/git/refs/heads/main`,
      jsonBody: "={{ { sha: $json.sha, force: false } }}",
      githubCredentialId,
    }),
    httpNode({
      name: 'Get Updated Ref',
      position: [2040, 220],
      url: `${REPO_API}/git/ref/heads/main`,
      githubCredentialId,
    }),
    httpNode({
      name: 'Get Published Commit',
      position: [2260, 220],
      url: `=${REPO_API}/git/commits/{{ $json.object.sha }}`,
      githubCredentialId,
    }),
    codeNode('Verify Published Ref', [2480, 220], `
const expectedCommit = $('Create Git Commit').first().json.sha;
const expectedTree = $('Create Git Tree').first().json.sha;
const actualRef = $('Get Updated Ref').first().json.object.sha;
const actualTree = $input.first().json.tree.sha;
if (actualRef !== expectedCommit) throw new Error('Published ref verification failed');
if (actualTree !== expectedTree) throw new Error('Published tree verification failed');
return [{ json: { commit_sha: actualRef, tree_sha: actualTree } }];`),
    respondNode('Published Response', [2700, 220], "={{ { ok: true, status: 'published', dry_run: false, noop: false, issue_id: $('Validate and Render').first().json.issue_id, revision: $('Validate and Render').first().json.revision, content_hash: $('Validate and Render').first().json.content_hash, commit_sha: $json.commit_sha } }}"),
  ];

  return {
    id: 'wklyAiPubV100001',
    name: 'Weekly AI Newsletter Publisher',
    active: false,
    nodes,
    connections: {
      'Newsletter Webhook': { main: [[{ node: 'Validate Request', type: 'main', index: 0 }]] },
      'Validate Request': { main: [[{ node: 'Get Main Ref', type: 'main', index: 0 }]] },
      'Get Main Ref': { main: [[{ node: 'Get Main Commit', type: 'main', index: 0 }]] },
      'Get Main Commit': { main: [[{ node: 'Get Manifest', type: 'main', index: 0 }]] },
      'Get Manifest': { main: [[{ node: 'Validate and Render', type: 'main', index: 0 }]] },
      'Validate and Render': { main: [[{ node: 'Dry Run?', type: 'main', index: 0 }]] },
      'Dry Run?': { main: [
        [{ node: 'Dry Run Response', type: 'main', index: 0 }],
        [{ node: 'Already Published?', type: 'main', index: 0 }],
      ] },
      'Already Published?': { main: [
        [{ node: 'Already Published Response', type: 'main', index: 0 }],
        [{ node: 'Expand Files', type: 'main', index: 0 }],
      ] },
      'Expand Files': { main: [[{ node: 'Create Git Blobs', type: 'main', index: 0 }]] },
      'Create Git Blobs': { main: [[{ node: 'Assemble Git Tree', type: 'main', index: 0 }]] },
      'Assemble Git Tree': { main: [[{ node: 'Create Git Tree', type: 'main', index: 0 }]] },
      'Create Git Tree': { main: [[{ node: 'Create Git Commit', type: 'main', index: 0 }]] },
      'Create Git Commit': { main: [[{ node: 'Update Main Ref', type: 'main', index: 0 }]] },
      'Update Main Ref': { main: [[{ node: 'Get Updated Ref', type: 'main', index: 0 }]] },
      'Get Updated Ref': { main: [[{ node: 'Get Published Commit', type: 'main', index: 0 }]] },
      'Get Published Commit': { main: [[{ node: 'Verify Published Ref', type: 'main', index: 0 }]] },
      'Verify Published Ref': { main: [[{ node: 'Published Response', type: 'main', index: 0 }]] },
    },
    settings: { executionOrder: 'v1', callerPolicy: 'workflowsFromSameOwner', availableInMCP: false },
    staticData: null,
    pinData: {},
    tags: [],
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const githubCredentialId = process.env.N8N_GITHUB_CREDENTIAL_ID;
  const webhookCredentialId = process.env.N8N_WEBHOOK_CREDENTIAL_ID;
  const output = process.argv[2] ?? 'n8n/weekly-ai-newsletter-publisher.json';
  writeFileSync(output, `${JSON.stringify([buildWorkflow({ githubCredentialId, webhookCredentialId })], null, 2)}\n`);
  console.log(output);
}
