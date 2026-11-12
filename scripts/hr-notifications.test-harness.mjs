import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { timingSafeEqual, createHmac } from 'node:crypto';
import ts from 'typescript';

// Execute the actual route/module source with fake authentication and a rollback-capable
// in-memory DB boundary. No credentials, network, production records, or employee fixtures.
export async function harness(options = {}) {
  const now = options.now ?? Date.parse('2026-11-09T00:03:00Z');
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const state = { records: [], outbox: [], after: [], locks: 0, fetches: [], summaries: [], decisions: [], audits: [], failSave: false, ...options };
  const employee = options.employee === null ? null : {
    id: 'employee-test', name: 'Test Employee', email: 'staff@example.test',
    active: true, workboardEnabled: true, systemRole: 'MEMBER', ...options.employee,
  };
  const timeMatches = (value, range) => !range ||
    ((range.gte === undefined || +value >= +range.gte) && (range.lt === undefined || +value < +range.lt));
  const matchingRecord = (where) => state.records.filter(row =>
    (!where.id || row.id === where.id) && (!where.employeeId || row.employeeId === where.employeeId) &&
    (!where.type || row.type === where.type) && (where.cancelledAt !== null || row.cancelledAt === null) &&
    timeMatches(row.timestamp, where.timestamp));
  const outbox = {
    create: async ({ data }) => {
      if (state.failEnqueue) throw Error('simulated outbox failure');
      if (state.outbox.some(row => row.idempotencyKey === data.idempotencyKey)) throw Error('duplicate');
      const row = { id: `outbox-${state.outbox.length + 1}`, status: 'PENDING', attempts: 0,
        nextAttemptAt: new Date(now - 1), createdAt: new Date(now - 1), ...data };
      state.outbox.push(row); return row;
    },
    createMany: async ({ data }) => {
      let count = 0;
      for (const item of data) if (!state.outbox.some(row => row.idempotencyKey === item.idempotencyKey)) {
        await outbox.create({data:item}); count++;
      }
      return { count };
    },
    findMany: async ({where, take}) => state.outbox.filter(row =>
      where.status.in.includes(row.status) && +row.nextAttemptAt <= +where.nextAttemptAt.lte &&
      (!where.idempotencyKey || row.idempotencyKey === where.idempotencyKey)).slice(0,take).map(row=>({...row})),
    updateMany: async ({where,data}) => {
      const row = state.outbox.find(row=>row.id===where.id && row.status===where.status && +row.nextAttemptAt<=+where.nextAttemptAt.lte);
      if (!row) return {count:0};
      Object.assign(row, {...data, attempts: row.attempts + data.attempts.increment}); return {count:1};
    },
    update: async ({where,data}) => {
      const row = state.outbox.find(row=>row.id===where.id);
      if (!row) throw Error('missing row');
      if (state.failSentCommit && data.status==='SENT') { state.failSentCommit=false; throw Error('simulated interrupted acknowledgement'); }
      Object.assign(row,data); return row;
    },
    count: async ({where}) => state.outbox.filter(row=>where.status.in ? where.status.in.includes(row.status) : where.status.not ? row.status!==where.status.not : row.status===where.status).length,
    findUnique: async ({where}) => state.outbox.find(row=>row.idempotencyKey===where.idempotencyKey) ?? null,
  };
  const db = {
    employee: { findUnique: async () => ({ ...employee, locationConsentAt: null, locationConsentVersion: null }), findMany: async () => [] },
    hrNotificationOutbox: outbox,
    attendanceRecord: {
      findUnique: async ({where}) => { const row=state.records.find(r=>r.id===where.id); return row?{...row,employee}:null; },
      findMany: async ({where}) => matchingRecord(where),
      findFirst: async ({where}) => matchingRecord(where).sort((a,b)=>+b.timestamp-+a.timestamp)[0] ?? null,
      create: async ({data}) => {
        if(state.failSave) throw Error('simulated record save failure');
        const row={id:`record-${state.records.length+1}`, timestamp:new Date(now),cancelledAt:null,...data};
        state.records.push(row); return row;
      },
      updateMany: async ({where,data}) => {
        const row=matchingRecord(where)[0]; if(!row)return {count:0}; Object.assign(row,data); return {count:1};
      },
    },
    leaveRequest: {
      findUnique: async ({where}) => {const row=(state.leaves??[]).find(r=>r.id===where.id); return row?{...row,employee:{active:true,...row.employee}}:null;},
      count: async()=>0,
      findMany: async args=>{state.summaries.push({kind:'leave',...args});return state.leaves??[];},
      findFirst: async ({where})=>(state.leaves??[]).find(row=>row.id===where.id && row.status===where.status)??null,
      updateMany: async ({where,data})=>{
        const row=(state.leaves??[]).find(row=>row.id===where.id && row.status===where.status);
        if(!row)return {count:0};Object.assign(row,data);return {count:1};
      },
    },
    businessTrip: {
      findUnique: async ({where}) => {const row=(state.trips??[]).find(r=>r.id===where.id); return row?{...row,employee:{active:true,...row.employee}}:null;},
      count: async()=>0,
      findMany: async args=>{state.summaries.push({kind:'trip',...args});return state.trips??[];},
      findFirst: async ({where})=>(state.trips??[]).find(row=>
        (!where.id || row.id===where.id) && row.status===where.status &&
        (!where.employeeId || row.employeeId===where.employeeId) &&
        (!where.startDate || +row.startDate<=+where.startDate.lte) &&
        (!where.endDate || +row.endDate>=+where.endDate.gte))??null,
      updateMany: async ({where,data})=>{
        const row=(state.trips??[]).find(row=>row.id===where.id && row.status===where.status);
        if(!row)return {count:0};Object.assign(row,data);return {count:1};
      },
    },
    approvalAudit: {create:async({data})=>{state.audits.push(data);return data;}},
    $queryRaw: async parts=>{assert.match(parts.join(''),/FOR UPDATE/);state.locks++;return [{id:'employee-test'}];},
  };
  let queue=Promise.resolve();
  db.$transaction=async callback=>{
    const prior=queue; let unlock; queue=new Promise(resolve=>{unlock=resolve}); await prior;
    const snapshot=structuredClone({records:state.records,outbox:state.outbox,leaves:state.leaves,trips:state.trips,audits:state.audits});
    try{return await callback(db);}catch(error){Object.assign(state,snapshot);throw error;}finally{unlock();}
  };
  const env={APPROVAL_CEO_EMAIL:'executive@example.test',WORKBOARD_STAFF_CHAT_WEBHOOK_URL:'https://chat.bnow.co.kr/api/staff-chat/webhooks/incoming',HR_CHRO_NOTIFICATIONS_START_AT:new Date(now-1000).toISOString(),
    WORKBOARD_STAFF_CHAT_WEBHOOK_TOKEN:'test-only-token',HR_NOTIFICATION_CRON_TOKEN:'test-only-cron'};
  const context=vm.createContext({Date:ClockDate,Request,Response,URL,Buffer,Intl,AbortController,setTimeout,clearTimeout,
    console, process:{env}, fetch:async(url,request)=>{
      state.fetches.push({url,authorization:request.headers.Authorization,...JSON.parse(request.body)});
      return state.respond ? state.respond() : Response.json({chatOk:true,roomId:'representative-direct-test',messageSeq:42});
    }});
  const modules=new Map();
  function synthetic(id,exports){const mod=new vm.SyntheticModule(Object.keys(exports),function(){for(const[k,v]of Object.entries(exports))this.setExport(k,v)},{context,identifier:id});modules.set(id,mod);return mod;}
  synthetic('next/server',{NextResponse:Response,after:callback=>state.after.push(callback)});
  synthetic('node:crypto',{timingSafeEqual,createHmac});
  synthetic('@/lib/prisma',{prisma:options.database??db});
  synthetic('@/lib/adminAuth',{isAdmin:async()=>employee?.systemRole==='ADMIN'});
  synthetic('@/lib/locationConsent',{hasCurrentLocationConsent:()=>false});
  synthetic('@/lib/workboardSession',{getCurrentWorkboardEmployee:async()=>employee});
  synthetic('@/lib/workboardApprovalNotifications',{
    pausedWebhookRecipients:new Set(['Paused Test Employee']),
    notifyEmployeeAboutApprovalDecision:async value=>state.decisions.push(value),
  });
  const root=path.resolve(import.meta.dirname,'../src');
  async function load(id){
    if(modules.has(id))return modules.get(id);
    const filename=id.startsWith('@/')?path.join(root,id.slice(2))+'.ts':id;
    if(modules.has(filename))return modules.get(filename);
    const source=await readFile(filename,'utf8');
    if(modules.has(filename))return modules.get(filename);
    const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
    const mod=new vm.SourceTextModule(code,{context,identifier:filename});modules.set(filename,mod);modules.set(id,mod);
    return mod;
  }
  const apiPromises=new Map();
  function api(id){
    if(!apiPromises.has(id))apiPromises.set(id,(async()=>{
      const mod=await load(id);
      if(mod.status==='unlinked')await mod.link(async(spec,referencing)=>load(spec.startsWith('.')?path.resolve(path.dirname(referencing.identifier),spec+'.ts'):spec));
      if(mod.status!=='evaluated')await mod.evaluate();
      return mod.namespace;
    })());
    return apiPromises.get(id);
  }
  return {state,db,env,api,now,post:async body=>(await api('@/app/api/attendance/route')).POST(new Request('http://hr.example.test/api/attendance',{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'}}))};
}
