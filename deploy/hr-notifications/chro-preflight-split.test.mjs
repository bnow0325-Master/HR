import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import * as crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { collectMetadata, CONTAINERS, FORMAT, projectMetadata } from './chro-metadata-preflight.mjs';
import { collectComparison, makeProbe, summarizeComparison } from './chro-webhook-compare-proposal.mjs';

const SESSION = '00000000-0000-0000-0000-000000000001';
const NONCE = 'a'.repeat(64);
const rows = CONTAINERS.map((name, i) => ({ name: '/' + name, id: String(i + 1).repeat(64), image: 'sha256:' + 'f'.repeat(64), imageRef: 'example.invalid/app:fixture', state: 'running', startedAt: '2026-11-13T00:00:00Z' }));
const snapshot = rows.map(({ id, image, state, startedAt }) => JSON.stringify({ id, image, state, startedAt })).join('\n');

function probe(role, env, nonce = NONCE) {
  let output = '';
  vm.runInNewContext(makeProbe(role), { require: name => { assert.equal(name, 'node:crypto'); return crypto; }, process: { argv: ['node', '-', nonce], env, stdout: { write: text => { output += text; } }, exit: () => { throw new Error('probe refused'); } } });
  return JSON.parse(output);
}

test('metadata command is a fixed narrow projection, never environment or execution', () => {
  let calls = 0;
  const result = collectMetadata(SESSION, (command, args) => {
    calls++; assert.equal(command, 'docker'); assert.deepEqual(args, ['inspect', '--format', FORMAT, ...CONTAINERS]);
    return rows.map(row => JSON.stringify({ ...row, unexpected: 'fixture-private' })).join('\n');
  });
  assert.equal(calls, 1); assert.equal(result.webhookConsistency, 'NOT_CHECKED');
  assert.doesNotMatch(JSON.stringify(result), /fixture-private/);
  assert.doesNotMatch(readFileSync(new URL('./chro-metadata-preflight.mjs', import.meta.url), 'utf8'), /process\.env|\.Config\.Env|DATABASE_URL|Prisma|password\s*:/);
});

test('metadata refuses missing session before running Docker', () => {
  assert.throws(() => collectMetadata('bad;command', () => assert.fail('must not run')));
});

test('metadata refuses substituted/duplicate identity and malformed image', () => {
  assert.throws(() => projectMetadata(JSON.stringify(rows[0]) + '\n' + JSON.stringify(rows[0])));
  assert.throws(() => projectMetadata(rows.map(r => JSON.stringify({ ...r, imageRef: 'contains spaces or private text' })).join('\n')));
});

test('comparison uses actual HR trim and receiver raw semantics, outputs only flags', () => {
  const hr = probe('hr', { WORKBOARD_STAFF_CHAT_WEBHOOK_TOKEN: '  synthetic-only  ', WORKBOARD_STAFF_CHAT_WEBHOOK_URL: 'https://chat.bnow.co.kr/api/staff-chat/webhooks/incoming', HR_CHRO_NOTIFICATIONS_START_AT: '2026-11-14T09:00:00+09:00' });
  const chat = probe('chat', { STAFF_CHAT_INCOMING_WEBHOOK_TOKEN: 'synthetic-only', AI_EXECUTIVE_EMPLOYEE_MESSAGES_ENABLED: 'false' });
  const summary = summarizeComparison(hr, chat);
  assert.equal(summary.existingServerSecretInputsMatch, true); assert.equal(summary.canonicalDestination, true);
  assert.equal(summary.chroCutoverConfigured, true); assert.equal(summary.executiveEmployeeDeliveryEnabled, false);
  assert.doesNotMatch(JSON.stringify(summary), new RegExp(hr.tag + '|synthetic-only'));
  assert.equal(summarizeComparison(hr, probe('chat', { STAFF_CHAT_INCOMING_WEBHOOK_TOKEN: ' synthetic-only ' })).existingServerSecretInputsMatch, false);
});

test('missing values remain unknown, never a successful empty comparison', () => {
  const summary = summarizeComparison(probe('hr', {}), probe('chat', {}));
  assert.equal(summary.existingServerSecretInputsMatch, null); assert.equal(summary.hrConfigured, false);
});

test('fresh nonce changes the transient proof and cannot be supplied as executable text', () => {
  const env = { STAFF_CHAT_INCOMING_WEBHOOK_TOKEN: 'synthetic-only' };
  assert.notEqual(probe('chat', env).tag, probe('chat', env, 'b'.repeat(64)).tag);
  assert.throws(() => probe('chat', env, 'bad'));
  assert.throws(() => makeProbe('arbitrary')); 
});

test('canonical destination fails closed for query, userinfo or alternative host; cutover requires timezone', () => {
  for (const url of ['https://chat.bnow.co.kr/api/staff-chat/webhooks/incoming?x=1', 'https://x@chat.bnow.co.kr/api/staff-chat/webhooks/incoming', 'https://other.invalid/api/staff-chat/webhooks/incoming']) {
    assert.equal(probe('hr', { WORKBOARD_STAFF_CHAT_WEBHOOK_URL: url }).canonicalDestination, false);
  }
  assert.equal(probe('hr', { HR_CHRO_NOTIFICATIONS_START_AT: '2026-11-14T09:00:00' }).cutoverConfigured, false);
});

test('comparison run never exports proof/input, does not send HTTP and reports remaining gates', () => {
  const proofs = [probe('hr', { WORKBOARD_STAFF_CHAT_WEBHOOK_TOKEN: 'synthetic-only' }), probe('chat', { STAFF_CHAT_INCOMING_WEBHOOK_TOKEN: 'synthetic-only' })];
  let execs = 0, inspects = 0;
  const result = collectComparison(SESSION, (command, args, options) => {
    assert.equal(command, 'docker');
    if (args[0] === 'inspect') { inspects++; return snapshot; }
    assert.deepEqual(args, ['exec', '-i', CONTAINERS[execs], 'node', '-', NONCE]);
    assert.equal(options.input, makeProbe(execs === 0 ? 'hr' : 'chat'));
    return JSON.stringify(proofs[execs++]);
  }, NONCE);
  assert.equal(execs, 2); assert.equal(inspects, 2); assert.equal(result.httpRequestsSent, 0);
  assert.equal(result.derivedChroAuthorization, 'NOT_CHECKED'); assert.equal(result.deploymentAuthorized, false);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(proofs[0].tag + '|' + NONCE + '|synthetic-only'));
});

test('changed/restarted container invalidates comparison instead of claiming readiness', () => {
  let inspects = 0;
  assert.throws(() => collectComparison(SESSION, (command, args) => {
    if (args[0] === 'inspect') return ++inspects === 1 ? snapshot : snapshot.replace('00:00:00Z', '00:01:00Z');
    return JSON.stringify(args[2] === CONTAINERS[0] ? probe('hr', {}) : probe('chat', {}));
  }, NONCE), /runtime changed/);
});

test('malformed proof and unavailable/non-running runtime fail closed', () => {
  assert.throws(() => summarizeComparison({ configured: true, tag: 'invalid' }, { configured: false, tag: null }));
  assert.throws(() => collectComparison(SESSION, () => snapshot.replace('running', 'paused'), NONCE));
  assert.throws(() => collectComparison(SESSION, () => { throw new Error('denied fixture'); }, NONCE));
});
