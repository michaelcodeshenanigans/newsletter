import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSubmission, decodePublisherResponse, isDirectExecution, parseEnv } from '../scripts/submit-to-n8n.mjs';

test('parseEnv reads simple key-value configuration without exposing unrelated values', () => {
  assert.deepEqual(parseEnv('A=one\n# comment\nB=two=three\n'), { A: 'one', B: 'two=three' });
});

test('buildSubmission defaults to dry_run and uses the configured authentication header', () => {
  const issue = { schema_version: 'newsletter.v1' };
  const request = buildSubmission(issue, {
    NEWSLETTER_WEBHOOK_URL: 'https://n8n.example/webhook/newsletter',
    NEWSLETTER_WEBHOOK_HEADER: 'X-Newsletter-Token',
    NEWSLETTER_WEBHOOK_TOKEN: 'secret',
  });
  assert.equal(request.url, 'https://n8n.example/webhook/newsletter');
  assert.equal(request.options.headers['X-Newsletter-Token'], 'secret');
  assert.deepEqual(JSON.parse(request.options.body), { mode: 'dry_run', issue });
});

test('isDirectExecution identifies the script entry point', () => {
  assert.equal(isDirectExecution('file:///opt/newsletter/submit.mjs', '/opt/newsletter/submit.mjs'), true);
  assert.equal(isDirectExecution('file:///opt/newsletter/submit.mjs', '/opt/newsletter/test.mjs'), false);
});

test('decodePublisherResponse rejects empty or invalid success responses', () => {
  assert.throws(() => decodePublisherResponse(''), /empty response/i);
  assert.throws(() => decodePublisherResponse('not-json'), /invalid JSON/i);
  assert.deepEqual(decodePublisherResponse('{"ok":true,"status":"dry_run"}'), { ok: true, status: 'dry_run' });
});
