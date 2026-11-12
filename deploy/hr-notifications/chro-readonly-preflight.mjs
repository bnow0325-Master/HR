// Operator evidence only. Do not execute after an access denial using another
// account/elevation. Wait for formal approval/operator-provided evidence.
// Run through an approved Alpacon agent WorkSession; no writes or message sends.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { userInfo, hostname } from 'node:os';
import { pathToFileURL } from 'node:url';

function docker(args) {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000, maxBuffer: 2_000_000 });
}

const hrProbe = String.raw`
const {createHash}=require('node:crypto');
const {PrismaClient}=require('@prisma/client');
const {PrismaMariaDb}=require('@prisma/adapter-mariadb');
let db;
(async()=>{
 const url=new URL(process.env.DATABASE_URL);
 db=new PrismaClient({adapter:new PrismaMariaDb({host:url.hostname,port:Number(url.port||3306),user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),database:decodeURIComponent(url.pathname.slice(1)),connectionLimit:1,timezone:'Z'}),log:[]});
 const [employees,statuses]=await Promise.all([
  db.employee.findMany({where:{active:true},select:{email:true,workboardEnabled:true}}),
  db.hrNotificationOutbox.groupBy({by:['status'],_count:{_all:true}})
 ]);
 const token=process.env.WORKBOARD_STAFF_CHAT_WEBHOOK_TOKEN?.trim()||'';
 const destination=new URL(process.env.WORKBOARD_STAFF_CHAT_WEBHOOK_URL||'https://invalid');
 process.stdout.write(JSON.stringify({employees,statuses,tokenHash:token?createHash('sha256').update(token).digest('hex'):null,canonical:destination.href==='https://chat.bnow.co.kr/api/staff-chat/webhooks/incoming',cutoverConfigured:Boolean(process.env.HR_CHRO_NOTIFICATIONS_START_AT)}));
})().catch(()=>{process.exitCode=1}).finally(async()=>{if(db)await db.$disconnect()});`;

const chatProbe = String.raw`
const {createHash}=require('node:crypto');
const {Pool}=require('pg');
const db=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:true}:false,max:1,connectionTimeoutMillis:5000});
(async()=>{
 const result=await db.query("SELECT lower(email) AS email FROM app_members WHERE is_active = true AND workboard_enabled = true AND lower(email) NOT LIKE 'ai-executive-%@agents.bnow.co.kr'");
 const token=process.env.STAFF_CHAT_INCOMING_WEBHOOK_TOKEN||'';
 process.stdout.write(JSON.stringify({emails:result.rows.map(r=>r.email),tokenHash:token?createHash('sha256').update(token).digest('hex'):null,employeeDeliveryEnabled:process.env.AI_EXECUTIVE_EMPLOYEE_MESSAGES_ENABLED==='true'}));
})().catch(()=>{process.exitCode=1}).finally(()=>db.end());`;

export function aggregateReadiness(hr, chat) {
  const employees = hr.employees;
  const normalized = (email) => String(email || '').trim().toLowerCase();
  const ready = new Set(chat.emails.map(normalized));
  const eligible = employees.filter((e) => e.workboardEnabled && normalized(e.email));
  const missing = eligible.filter((e) => !ready.has(normalized(e.email))).length;
  return {
    activeHrEmployees: employees.length,
    withoutEmail: employees.filter((e) => !normalized(e.email)).length,
    workboardDisabled: employees.filter((e) => !e.workboardEnabled).length,
    eligibleHrRecipients: eligible.length,
    eligibleMissingChatAccount: missing,
    readyRecipients: eligible.length - missing,
    allActiveEmployeesReady: eligible.length === employees.length && missing === 0,
    existingOutbox: Object.fromEntries(hr.statuses.map((r) => [r.status, r._count._all])),
    existingServerSecretsMatch: Boolean(hr.tokenHash && hr.tokenHash === chat.tokenHash),
    canonicalDestination: hr.canonical,
    chroCutoverConfigured: hr.cutoverConfigured,
    executiveEmployeeDeliveryEnabled: chat.employeeDeliveryEnabled === true,
  };
}

async function main() {
  const workSessionId = process.argv[2] || process.env.ALPACON_WORK_SESSION;
  if (!/^[a-f0-9-]{36}$/i.test(workSessionId || '')) throw new Error('approved work session required');
  const hr = JSON.parse(docker(['exec', 'bnow-checkinout-app-1', 'node', '-e', hrProbe]));
  const chat = JSON.parse(docker(['exec', 'bnow-chat-server-api-1', 'node', '-e', chatProbe]));
  const format = '{"name":{{json .Name}},"image":{{json .Image}},"imageRef":{{json .Config.Image}},"state":{{json .State.Status}},"workdir":{{json (index .Config.Labels "com.docker.compose.project.working_dir")}}}';
  const releases = docker(['inspect', '--format', format, 'bnow-checkinout-app-1', 'bnow-chat-server-api-1']).trim().split('\n').map(line=>JSON.parse(line));
  // Identifiers/token hashes stay in this process only. stdout is aggregate evidence.
  process.stdout.write(JSON.stringify({ at: new Date().toISOString(), workSessionId, operatorAccount: userInfo().username, host: hostname(), releases, ...aggregateReadiness(hr, chat) }) + '\n');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(() => { console.error('Read-only CHRO preflight unavailable; no row data or credentials printed.'); process.exitCode = 1; });
}
