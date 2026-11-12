import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';

const entry = new URL('./dispatch-tick.mjs', import.meta.url).href;
function run(mock, token = 'test-only-scheduler-token') {
  return spawnSync(process.execPath, ['--input-type=module', '-e', `${mock};await import(${JSON.stringify(entry)});`], {
    encoding: 'utf8',
    env: { SystemRoot: process.env.SystemRoot || '', HR_NOTIFICATION_CRON_TOKEN: token },
    timeout: 5000,
  });
}

test('tick uses the app-local protected endpoint and logs aggregate counters only', () => {
  const result = run(`globalThis.fetch=async(url,options)=>{
    if(url!=='http://127.0.0.1:3000/api/internal/hr-notification-dispatch')throw Error('destination');
    if(options.method!=='POST'||options.headers.Authorization!=='Bearer test-only-scheduler-token'||!options.signal)throw Error('request');
    return Response.json({summary:{due:true,queued:true,message:'DO_NOT_PRINT'},delivery:{sent:2,failed:0,pending:0,configured:true,token:'DO_NOT_PRINT'}});
  }`);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {summaryDue:true,queued:true,sent:2,failed:0,pending:0,configured:true,chroConfigured:false});
  assert.doesNotMatch(result.stdout + result.stderr, /DO_NOT_PRINT|test-only-scheduler-token|Bearer/);
});

test('a missing cron token fails closed without calling fetch', () => {
  const result = run(`globalThis.fetch=()=>{console.log('FETCH_CALLED');throw Error('must not call')}`, '');
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
});

for (const [name, mock] of [
  ['HTTP rejection', `globalThis.fetch=async()=>new Response('DO_NOT_PRINT',{status:401})`],
  ['network failure', `globalThis.fetch=async()=>{throw Error('DO_NOT_PRINT')}`],
  ['invalid JSON', `globalThis.fetch=async()=>new Response('DO_NOT_PRINT')`],
  ['unconfigured webhook', `globalThis.fetch=async()=>Response.json({delivery:{sent:0,failed:0,pending:3,configured:false}})`],
  ['partially failed batch', `globalThis.fetch=async()=>Response.json({delivery:{sent:1,failed:1,pending:1,configured:true}})`],
]) {
  test(`${name} is visible as a failed scheduler run without sensitive log content`, () => {
    const result = run(mock);
    assert.equal(result.status, 1, result.stderr);
    assert.doesNotMatch(result.stdout + result.stderr, /DO_NOT_PRINT|test-only-scheduler-token|Bearer/);
  });
}
