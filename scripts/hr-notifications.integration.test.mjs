import assert from 'node:assert/strict';
import test from 'node:test';
import { harness } from './hr-notifications.test-harness.mjs';

test('authentication failure cannot save attendance or enqueue notifications',async()=>{
  const h=await harness({employee:null});assert.equal((await h.post({type:'IN'})).status,401);
  assert.equal(h.state.records.length,0);assert.equal(h.state.outbox.length,0);
});
test('concurrent duplicate clicks save once and separate representative and self recipients',async()=>{
  const h=await harness();const result=await Promise.all([h.post({type:'IN'}),h.post({type:'IN'})]);
  assert.deepEqual(result.map(r=>r.status).sort(),[200,409]);assert.equal(h.state.records.length,1);assert.equal(h.state.locks,2);
  assert.deepEqual(h.state.outbox.map(r=>[r.audience,r.recipientEmail]),[['operations','executive@example.test'],['work','staff@example.test']]);
  assert.equal(h.state.after.length,1);assert.equal(h.state.fetches.length,0);
  assert.equal(new Set(h.state.outbox.map(r=>r.idempotencyKey)).size,2);
});
for(const failure of ['failSave','failEnqueue'])test(`${failure} rolls back the record and queues zero messages`,async()=>{
  const h=await harness({[failure]:true});await assert.rejects(h.post({type:'IN'}));
  assert.equal(h.state.records.length,0);assert.equal(h.state.outbox.length,0);assert.equal(h.state.after.length,0);
});
test('cancel and repeat checkout retain the original record and queue corrections separately',async()=>{
  const h=await harness();assert.equal((await h.post({type:'OUT'})).status,200);
  assert.equal((await h.post({action:'CANCEL_OUT'})).status,200);
  assert.equal((await h.post({type:'OUT'})).status,200);
  assert.equal(h.state.records.length,2);assert.ok(h.state.records[0].cancelledAt);
  assert.equal(h.state.outbox.length,6);assert.equal(new Set(h.state.outbox.map(r=>r.idempotencyKey)).size,6);
});
test('checkout cancellation after 30 minutes creates no correction',async()=>{
  const h=await harness();h.state.records.push({id:'old',employeeId:'employee-test',type:'OUT',timestamp:new Date(h.now-30*60000-1),cancelledAt:null});
  assert.equal((await h.post({action:'CANCEL_OUT'})).status,409);assert.equal(h.state.outbox.length,0);
});
test('a checkout crossing midnight remains allowed',async()=>{
  const h=await harness({now:Date.parse('2026-11-08T15:00:30Z')});
  h.state.records.push({id:'prior-in',employeeId:'employee-test',type:'IN',timestamp:new Date(h.now-3*3600000),cancelledAt:null});
  assert.equal((await h.post({type:'OUT'})).status,200);
});
for(const [age,status]of[[60000,409],[60001,200]])test(`same-type duplicate guard boundary ${age}ms`,async()=>{
  const h=await harness();h.state.records.push({id:'prior',employeeId:'employee-test',type:'IN',timestamp:new Date(h.now-age),cancelledAt:null});
  assert.equal((await h.post({type:'IN'})).status,status);
});
test('HTTP 202 without chat storage remains pending and keeps the same delivery key',async()=>{
  const h=await harness();await h.post({type:'IN'});h.state.respond=()=>Response.json({chatOk:false,messageSeq:null},{status:202});
  const key=h.state.outbox[0].idempotencyKey;await(await h.api('@/lib/hrNotifications')).dispatchPendingHrNotifications(1);
  assert.equal(h.state.outbox[0].status,'PENDING');assert.equal(h.state.outbox[0].attempts,1);assert.equal(h.state.fetches[0].idempotencyKey,key);
});
test('concurrent workers claim one pending record and save the private room receipt',async()=>{
  const h=await harness();await h.post({type:'IN'});const api=await h.api('@/lib/hrNotifications');
  await Promise.all([api.dispatchPendingHrNotifications(1),api.dispatchPendingHrNotifications(1)]);
  assert.equal(h.state.fetches.length,1);assert.equal(h.state.outbox[0].status,'SENT');
  assert.equal(h.state.outbox[0].remoteRoomId,'representative-direct-test');assert.equal(h.state.outbox[0].remoteMessageSeq,42);
});
test('expired sending leases recover and interrupted acknowledgements retry with the same key',async()=>{
  const h=await harness();await h.post({type:'IN'});const row=h.state.outbox[0];row.status='SENDING';h.state.failSentCommit=true;
  const api=await h.api('@/lib/hrNotifications');await api.dispatchPendingHrNotifications(1);
  assert.equal(row.status,'PENDING');row.nextAttemptAt=new Date(h.now-1);await api.dispatchPendingHrNotifications(1);
  assert.equal(row.status,'SENT');assert.equal(h.state.fetches.length,2);
  assert.equal(h.state.fetches[0].idempotencyKey,h.state.fetches[1].idempotencyKey);
});
test('unconfigured chat does not discard the durable outbox',async()=>{
  const h=await harness();await h.post({type:'IN'});h.env.WORKBOARD_STAFF_CHAT_WEBHOOK_TOKEN='';
  const result=await(await h.api('@/lib/hrNotifications')).dispatchPendingHrNotifications(1);
  assert.equal(result.configured,false);assert.equal(h.state.fetches.length,0);assert.equal(h.state.outbox[0].status,'PENDING');
});
test('Monday summary is weekly only, crosses years, and is idempotent',async()=>{
  const h=await harness({now:Date.parse('2026-12-28T00:00:00Z')});
  const api=await h.api('@/lib/hrNotificationSchedule');await api.enqueueDueHrSummary(new Date(h.now));await api.enqueueDueHrSummary(new Date(h.now));
  assert.equal(h.state.outbox.length,1);assert.match(h.state.outbox[0].message,/2026-12-28~2027-01-03/);
  assert.equal(h.state.outbox[0].idempotencyKey,'hr-summary-ceo-week-2026-12-28');
  const query=h.state.summaries.find(q=>q.kind==='trip');assert.equal(query.where.status,'APPROVED');assert.equal(query.where.employee.active,true);
  assert.equal(query.where.startDate.lt.toISOString(),'2027-01-04T00:00:00.000Z');
});
test('before 09:00 no schedule query occurs; empty daily decisions are remembered',async()=>{
  const h=await harness();const api=await h.api('@/lib/hrNotificationSchedule');
  await api.enqueueDueHrSummary(new Date('2026-11-09T23:59:00Z'));assert.equal(h.state.summaries.length,0);
  await api.enqueueDueHrSummary(new Date('2026-11-10T00:00:00Z'));
  assert.equal(h.state.outbox[0].status,'SKIPPED');
  h.state.leaves=[{employee:{name:'Test Employee'},leaveDate:new Date('2026-11-10T00:00:00Z'),leaveType:'AM_HALF'}];
  await api.enqueueDueHrSummary(new Date('2026-11-10T01:00:00Z'));assert.equal(h.state.outbox.length,1);assert.equal(h.state.outbox[0].status,'SKIPPED');
});

test('paused employee self-notification stays suppressed while representative reporting remains enabled',async()=>{
  const h=await harness({employee:{name:'Paused Test Employee'}});await h.post({type:'IN'});
  assert.equal(h.state.outbox.length,1);assert.equal(h.state.outbox[0].audience,'operations');
});

for(const employee of [null,{email:'staff@example.test',systemRole:'MEMBER'},
  {email:'other-admin@example.test',systemRole:'ADMIN'},{email:'executive@example.test',systemRole:'MEMBER'},
  {email:'executive@example.test',systemRole:'ADMIN',active:false}]) {
  test(`private notification diagnostics deny ${employee?.email??'anonymous'} / ${employee?.systemRole??'none'} / active=${employee?.active??true}`,async()=>{
    const h=await harness({employee});const api=await h.api('@/app/api/admin/hr-notifications/route');
    assert.equal((await api.GET()).status,403);assert.equal((await api.POST()).status,403);
    assert.equal(h.state.outbox.length,0);assert.equal(h.state.fetches.length,0);
  });
}

test('representative connection check reuses one harmless message and exposes its private-room receipt',async()=>{
  const h=await harness({employee:{email:'executive@example.test',systemRole:'ADMIN'}});
  const api=await h.api('@/app/api/admin/hr-notifications/route');
  const first=await(await api.POST()).json();const again=await(await api.POST()).json();
  assert.equal(first.connection.status,'SENT');assert.equal(first.connection.remoteRoomId,'representative-direct-test');
  assert.equal(first.connection.remoteMessageSeq,again.connection.remoteMessageSeq);
  assert.equal(h.state.outbox.length,1);assert.equal(h.state.fetches.length,1);assert.equal(h.state.records.length,0);
});

test('scheduler rejects missing, invalid, and wrong-length credentials before reading or sending data',async()=>{
  const h=await harness();const api=await h.api('@/app/api/internal/hr-notification-dispatch/route');
  for(const authorization of ['', 'Bearer wrong', 'Bearer a-very-long-wrong-token']) {
    const response=await api.POST(new Request('http://hr.example.test/api/internal/hr-notification-dispatch',{method:'POST',headers:{authorization}}));
    assert.equal(response.status,401);
  }
  assert.equal(h.state.summaries.length,0);assert.equal(h.state.outbox.length,0);
});

for(const kind of ['leave','business-trip'])test(`concurrent ${kind} approval commits one representative alert and preserves the own-employee decision notification`,async()=>{
  const h=await harness({employee:{email:'executive@example.test',systemRole:'ADMIN'}});
  const item={id:'request-test',status:'PENDING',employeeId:'requester-test',employee:{id:'requester-test',code:'fixture',name:'Test Requester',email:'requester@example.test'},
    leaveType:'AM_HALF',leaveDate:new Date('2026-11-09T00:00:00Z'),startDate:new Date('2026-11-09T00:00:00Z'),endDate:new Date('2026-11-10T00:00:00Z')};
  h.state[kind==='leave'?'leaves':'trips']=[item];const api=await h.api('@/app/api/admin/approvals/route');
  const request=()=>new Request('http://hr.example.test/api/admin/approvals',{method:'PATCH',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({kind,requestId:'request-test',action:'APPROVE',reviewerNote:'DO_NOT_INCLUDE_IN_EXECUTIVE_MESSAGE'})});
  const responses=await Promise.all([api.PATCH(request()),api.PATCH(request())]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal(h.state.outbox.length,1);
  assert.equal(h.state.outbox[0].recipientEmail,'executive@example.test');assert.equal(h.state.decisions.length,1);
  assert.doesNotMatch(h.state.outbox[0].message,/DO_NOT_INCLUDE_IN_EXECUTIVE_MESSAGE/);
});

test('rejection is delivered only through the existing own-employee decision path',async()=>{
  const h=await harness({employee:{email:'executive@example.test',systemRole:'ADMIN'},leaves:[{
    id:'request-test',status:'PENDING',leaveType:'ANNUAL',leaveDate:new Date('2026-11-09T00:00:00Z'),
    employee:{id:'requester-test',code:'fixture',name:'Test Requester',email:'requester@example.test'},
  }]});
  const api=await h.api('@/app/api/admin/approvals/route');
  const response=await api.PATCH(new Request('http://hr.example.test/api/admin/approvals',{method:'PATCH',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({kind:'leave',requestId:'request-test',action:'REJECT',reviewerNote:'Test reason'})}));
  assert.equal(response.status,200);assert.equal(h.state.outbox.length,0);assert.equal(h.state.decisions.length,1);
});
