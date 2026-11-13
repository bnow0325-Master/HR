// Proposal only: requires a new, explicitly approved file hash and WorkSession.
// No database, environment inspection, HTTP request, dispatch, or configuration write.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CONTAINERS = ['bnow-checkinout-app-1', 'bnow-chat-server-api-1'];
export const FORMAT = '{"name":{{json .Name}},"id":{{json .Id}},"image":{{json .Image}},"imageRef":{{json .Config.Image}},"state":{{json .State.Status}},"startedAt":{{json .State.StartedAt}}}';

export function requireSession(value) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value || '')) throw new Error('session required');
  return value;
}

export function projectMetadata(text) {
  const rows = text.trim().split(/\r?\n/).map(line => JSON.parse(line));
  if (rows.length !== CONTAINERS.length) throw new Error('unexpected containers');
  return CONTAINERS.map(name => {
    const matches = rows.filter(row => row.name === '/' + name);
    if (matches.length !== 1) throw new Error('unexpected container');
    const row = matches[0];
    if (!/^[a-f0-9]{64}$/.test(row.id) || !/^sha256:[a-f0-9]{64}$/.test(row.image)) throw new Error('invalid identity');
    if (typeof row.imageRef !== 'string' || row.imageRef.length > 300 || !/^[A-Za-z0-9_.:/@-]+$/.test(row.imageRef)) throw new Error('invalid image reference');
    if (!['created', 'running', 'paused', 'restarting', 'removing', 'exited', 'dead'].includes(row.state)) throw new Error('invalid state');
    if (typeof row.startedAt !== 'string' || !Number.isFinite(Date.parse(row.startedAt))) throw new Error('invalid start time');
    // Explicit projection: any unexpected fields are discarded, never spread.
    return { name, id: row.id, image: row.image, imageRef: row.imageRef, state: row.state, startedAt: row.startedAt };
  });
}

export function collectMetadata(workSessionId, run = execFileSync) {
  requireSession(workSessionId);
  const text = run('docker', ['inspect', '--format', FORMAT, ...CONTAINERS], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000, maxBuffer: 16_384,
  });
  return {
    at: new Date().toISOString(), workSessionId, scope: 'container identity and state only',
    releases: projectMetadata(text),
    recipientReadiness: 'NOT_CHECKED', outbox: 'NOT_CHECKED', webhookConsistency: 'NOT_CHECKED',
    backupAndIsolatedRestore: 'NOT_CHECKED', deploymentAuthorized: false,
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { process.stdout.write(JSON.stringify(collectMetadata(process.argv[2])) + '\n'); }
  catch { console.error('CHRO metadata preflight unavailable; no child output printed.'); process.exitCode = 1; }
}
