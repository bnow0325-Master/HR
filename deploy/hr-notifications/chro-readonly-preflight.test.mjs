import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateReadiness } from './chro-readonly-preflight.mjs';

test('operator report exposes only counts, distinguishes missing/disabled accounts and preserves old receipt counts', () => {
  const summary = aggregateReadiness({ employees: [{email:'one@example.test',workboardEnabled:true},{email:'two@example.test',workboardEnabled:true},{email:null,workboardEnabled:false}],statuses:[{status:'SENT',_count:{_all:38}}],tokenHash:'test-fingerprint',canonical:true,cutoverConfigured:false },{emails:['ONE@example.test'],tokenHash:'test-fingerprint'});
  assert.equal(summary.readyRecipients,1); assert.equal(summary.eligibleMissingChatAccount,1);
  assert.equal(summary.withoutEmail,1); assert.equal(summary.workboardDisabled,1);
  assert.equal(summary.allActiveEmployeesReady,false); assert.equal(summary.existingOutbox.SENT,38);
  assert.equal(summary.existingServerSecretsMatch,true);
  assert.doesNotMatch(JSON.stringify(summary), /example\.test|test-fingerprint/);
});
