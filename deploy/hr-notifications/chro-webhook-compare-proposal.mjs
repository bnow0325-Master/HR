// Separate sensitive-read proposal. Do not run under approval of an older file.
// Reads existing container environment in memory; never reads a database or sends HTTP.
// The external Alpacon gate must approve this exact file, scope, account, and session.
import { execFileSync } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CONTAINERS = ['bnow-checkinout-app-1', 'bnow-chat-server-api-1'];
const SNAPSHOT_FORMAT = '{"id":{{json .Id}},"image":{{json .Image}},"state":{{json .State.Status}},"startedAt":{{json .State.StartedAt}}}';
const DOMAIN = 'bnow-chro-preflight-comparison:v1:';

export function makeProbe(role) {
  if (!['hr', 'chat'].includes(role)) throw new Error('invalid role');
  // Program bytes contain variable names only, no environment values or DB adapters.
  return `const {createHmac}=require('node:crypto');
const nonce=process.argv[2];
if(!/^[a-f0-9]{64}$/.test(nonce||''))process.exit(2);
const value=${role === 'hr' ? "(process.env.WORKBOARD_STAFF_CHAT_WEBHOOK_TOKEN||'').trim()" : "process.env.STAFF_CHAT_INCOMING_WEBHOOK_TOKEN||''"};
const configured=value.length>0;
const result={configured,tag:configured?createHmac('sha256',value).update('${DOMAIN}'+nonce).digest('hex'):null};
${role === 'hr' ? `result.canonicalDestination=(process.env.WORKBOARD_STAFF_CHAT_WEBHOOK_URL||'').trim()==='https://chat.bnow.co.kr/api/staff-chat/webhooks/incoming';
const start=(process.env.HR_CHRO_NOTIFICATIONS_START_AT||'').trim();
result.cutoverConfigured=/^\\d{4}-\\d{2}-\\d{2}T.*(?:Z|[+-]\\d{2}:\\d{2})$/.test(start)&&Number.isFinite(Date.parse(start));` : "result.employeeDeliveryEnabled=process.env.AI_EXECUTIVE_EMPLOYEE_MESSAGES_ENABLED==='true';"}
process.stdout.write(JSON.stringify(result));`;
}

function snapshot(run, options) {
  const lines = run('docker', ['inspect', '--format', SNAPSHOT_FORMAT, ...CONTAINERS], options).trim().split(/\r?\n/);
  if (lines.length !== 2) throw new Error('invalid snapshot');
  return lines.map(line => {
    const row = JSON.parse(line);
    if (!/^[a-f0-9]{64}$/.test(row.id) || !/^sha256:[a-f0-9]{64}$/.test(row.image) || row.state !== 'running' || !Number.isFinite(Date.parse(row.startedAt))) throw new Error('container not ready');
    return { id: row.id, image: row.image, startedAt: row.startedAt };
  });
}

export function summarizeComparison(hr, chat) {
  for (const row of [hr, chat]) {
    if (typeof row.configured !== 'boolean' || (row.configured ? !/^[a-f0-9]{64}$/.test(row.tag || '') : row.tag !== null)) throw new Error('invalid proof');
  }
  if (typeof hr.canonicalDestination !== 'boolean' || typeof hr.cutoverConfigured !== 'boolean' || typeof chat.employeeDeliveryEnabled !== 'boolean') throw new Error('invalid flags');
  const bothConfigured = hr.configured && chat.configured;
  return {
    hrConfigured: hr.configured, chatConfigured: chat.configured,
    existingServerSecretInputsMatch: bothConfigured ? timingSafeEqual(Buffer.from(hr.tag, 'hex'), Buffer.from(chat.tag, 'hex')) : null,
    canonicalDestination: hr.canonicalDestination, chroCutoverConfigured: hr.cutoverConfigured,
    executiveEmployeeDeliveryEnabled: chat.employeeDeliveryEnabled,
  };
}

export function collectComparison(workSessionId, run = execFileSync, nonce = randomBytes(32).toString('hex')) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(workSessionId || '') || !/^[a-f0-9]{64}$/.test(nonce)) throw new Error('invalid context');
  const options = { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 15_000, maxBuffer: 16_384 };
  const before = snapshot(run, options);
  const results = CONTAINERS.map((name, index) => JSON.parse(run('docker', ['exec', '-i', name, 'node', '-', nonce], {
    ...options, input: makeProbe(index === 0 ? 'hr' : 'chat'),
  })));
  const after = snapshot(run, options);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('runtime changed during check');
  return {
    at: new Date().toISOString(), workSessionId, scope: 'existing shared inputs and configuration flags only',
    containers: before, ...summarizeComparison(...results),
    recipientReadiness: 'NOT_CHECKED', database: 'NOT_CHECKED', backupAndIsolatedRestore: 'NOT_CHECKED',
    derivedChroAuthorization: 'NOT_CHECKED', endpointAcceptance: 'NOT_CHECKED', deviceReceipt: 'NOT_CHECKED',
    httpRequestsSent: 0, deploymentAuthorized: false,
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { process.stdout.write(JSON.stringify(collectComparison(process.argv[2])) + '\n'); }
  catch { console.error('CHRO comparison unavailable; no environment, proof, or child output printed.'); process.exitCode = 1; }
}
