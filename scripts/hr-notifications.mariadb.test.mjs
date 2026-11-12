import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { harness } from './hr-notifications.test-harness.mjs';

// Only the disposable, named CI MariaDB service is eligible. No dotenv loading.
const url = new URL(process.env.DATABASE_URL || 'mysql://disabled@invalid/disabled');
const eligible = process.env.CI === 'true' && ['127.0.0.1','localhost'].includes(url.hostname) &&
  url.pathname === '/bnow_hr' && decodeURIComponent(url.username) === 'hr_ci';

async function fixture(fn) {
  const db = new PrismaClient({adapter:new PrismaMariaDb({host:url.hostname,port:Number(url.port||3306),
    database:'bnow_hr',user:'hr_ci',password:decodeURIComponent(url.password),connectionLimit:5})});
  const id=`hr-notify-test-${randomUUID()}`;
  try {
    await db.employee.create({data:{id,code:id,name:'Test Employee',email:`${id}@example.test`,active:true,attendanceEnabled:true,workboardEnabled:true}});
    await fn(db,id);
  } finally {
    const records=await db.attendanceRecord.findMany({where:{employeeId:id},select:{id:true}});
    for(const record of records) await db.hrNotificationOutbox.deleteMany({where:{idempotencyKey:{in:[
      `hr-chro-v1:hr-attendance-ceo-IN-${record.id}`,`hr-chro-v1:hr-attendance-self-IN-${record.id}`,
    ]}}});
    await db.attendanceRecord.deleteMany({where:{employeeId:id}});
    await db.employee.deleteMany({where:{id}});
    await db.$disconnect();
  }
}

test('actual MariaDB row locks serialize concurrent attendance requests and persist exactly two private outbox rows',
  {skip:eligible?false:'requires the disposable CI hr_ci@localhost/bnow_hr service'},async()=>fixture(async(db,id)=>{
    const h=await harness({now:Date.now(),database:db,employee:{id,email:`${id}@example.test`}});
    const responses=await Promise.all([h.post({type:'IN'}),h.post({type:'IN'}),h.post({type:'IN'})]);
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,409,409]);
    const records=await db.attendanceRecord.findMany({where:{employeeId:id}});assert.equal(records.length,1);
    const rows=await db.hrNotificationOutbox.findMany({where:{idempotencyKey:{in:[
      `hr-chro-v1:hr-attendance-ceo-IN-${records[0].id}`,`hr-chro-v1:hr-attendance-self-IN-${records[0].id}`,
    ]}}});
    assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>r.audience).sort(),['operations','work']);
    assert.ok(rows.every(r=>r.status==='CHRO_PENDING'));
    assert.equal(await db.hrNotificationOutbox.count({where:{id:{in:rows.map(r=>r.id)},status:{in:['PENDING','SENDING']}}}),0);
    assert.equal(rows.find(r=>r.audience==='operations').recipientEmail,'executive@example.test');
    assert.equal(rows.find(r=>r.audience==='work').recipientEmail,`${id}@example.test`);
    assert.equal(h.state.fetches.length,0);
  }));

test('actual MariaDB outbox insertion failure rolls back attendance instead of creating an unnotified committed record',
  {skip:eligible?false:'requires the disposable CI hr_ci@localhost/bnow_hr service'},async()=>fixture(async(db,id)=>{
    const h=await harness({now:Date.now(),database:db,employee:{id,email:`${'x'.repeat(321)}@example.test`}});
    await db.hrNotificationOutbox.count(); // Do not mistake missing schema for the expected failure.
    await assert.rejects(h.post({type:'IN'}), error=>error.code==='P2000');
    assert.equal(await db.attendanceRecord.count({where:{employeeId:id}}),0);
    assert.equal(h.state.after.length,0);
    assert.equal(h.state.fetches.length,0);
  }));
