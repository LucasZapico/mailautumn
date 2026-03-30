import { spawn, ChildProcess } from 'child_process';
import { Readable } from 'stream';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import log from 'electron-log/main';
import { app, BrowserWindow } from 'electron';
import { getConfigDir } from './database';
import { getGmailClientId, getGmailClientSecret } from './oauth';
import { startIdentityServer } from './identity-server';

// Path to mailsync binary — resolved in order:
// 1. MAILSYNC_DIR env var (for dev/custom setups)
// 2. Packaged app: resources/mailsync/
// 3. Dev fallback: resources/mailsync/ relative to project root
function resolveMailsyncDir(): string {
  if (process.env.MAILSYNC_DIR) return process.env.MAILSYNC_DIR;
  // In packaged app, process.resourcesPath points to <app>/resources
  if (app.isPackaged) return path.join(process.resourcesPath, 'mailsync');
  // Dev mode: resources/ in project root
  return path.join(__dirname, '..', '..', 'resources', 'mailsync');
}

const MAILSYNC_DIR = resolveMailsyncDir();
const MAILSYNC_PATH = path.join(MAILSYNC_DIR, 'mailsync.bin');

// Log paths at startup for debugging packaged-app issues
log.info(`[mailsync] dir: ${MAILSYNC_DIR}`);
log.info(`[mailsync] bin: ${MAILSYNC_PATH} (exists: ${fs.existsSync(MAILSYNC_PATH)}, isPackaged: ${app.isPackaged})`);
log.info(`[mailsync] CONFIG_DIR: ${getConfigDir()}`);

export interface AccountForSync {
  id: string;
  name: string;
  provider: string;
  emailAddress: string;
  settings: Record<string, any>;
}

/** Serialize account into the format the C++ mailsync binary expects */
function serializeAccount(account: AccountForSync): string {
  return JSON.stringify({
    __cls: 'Account',
    id: account.id,
    aid: account.id,
    v: 1,
    name: account.name,
    provider: account.provider,
    emailAddress: account.emailAddress,
    settings: account.settings,
    label: account.emailAddress,
    aliases: [],
    defaultAlias: '',
    autoaddress: { value: '', type: 'bcc' },
    syncState: 'ok',
    syncError: null,
    color: '#4a9eff',
    authedAt: Math.floor(Date.now() / 1000),
    pluginMetadata: [],
  });
}

function makeIdentity(emailAddress: string) {
  return {
    id: 'local-user',
    token: 'local-bypass',
    firstName: 'User',
    lastName: '',
    emailAddress,
    object: 'identity',
    createdAt: new Date().toISOString(),
    stripePlan: 'Pro',
    stripePlanEffective: 'Pro',
    featureUsage: {},
  };
}

function makeEnv(): NodeJS.ProcessEnv {
  const identityServer = startIdentityServer();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CONFIG_DIR_PATH: getConfigDir(),
    IDENTITY_SERVER: identityServer,
    SASL_PATH: MAILSYNC_DIR,
    GMAIL_CLIENT_ID: getGmailClientId(),
    GMAIL_CLIENT_SECRET: getGmailClientSecret(),
  };
  if (!env.GMAIL_CLIENT_SECRET) log.warn('[mailsync] GMAIL_CLIENT_SECRET is empty — OAuth token refresh will fail');
  return env;
}

// ── Single mailsync process ──

export class MailsyncProcess {
  private proc: ChildProcess | null = null;
  private account: AccountForSync;
  private verbose: boolean;
  private ready = false;
  private pendingMessages: Record<string, any>[] = [];

  constructor(account: AccountForSync, verbose = false) {
    this.account = account;
    this.verbose = verbose;
  }

  /** Run a one-shot command (migrate, test, reset) and return result */
  async runAndWait(mode: 'migrate' | 'test' | 'reset'): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const args = ['--mode', mode];
      if (this.verbose) args.push('--verbose');
      if (this.account) args.push('--info', this.account.emailAddress);

      log.info(`mailsync [${mode}] starting for ${this.account.emailAddress}`);
      const proc = spawn(MAILSYNC_PATH, args, { env: makeEnv() });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (chunk) => {
        const text = chunk.toString();
        stdout += text;

        // On first data, send account + identity
        if (stdout.length === text.length && this.account) {
          const rs = new Readable();
          rs.push(`${serializeAccount(this.account)}\n${JSON.stringify(makeIdentity(this.account.emailAddress))}\n`);
          rs.push(null);
          rs.pipe(proc.stdin!, { end: false });
        }
      });
      proc.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });

      proc.on('close', (code) => {
        log.info(`mailsync [${mode}] exited with code ${code}`);
        if (code === 0) {
          resolve({ success: true });
        } else {
          // Try to parse last line as JSON error
          const lines = stdout.trim().split('\n');
          const lastLine = lines[lines.length - 1];
          try {
            const result = JSON.parse(lastLine);
            resolve({ success: false, error: result.error || stderr });
          } catch {
            resolve({ success: false, error: stderr || `Exit code ${code}` });
          }
        }
      });

      proc.on('error', (err) => {
        log.error(`mailsync [${mode}] spawn error:`, err);
        resolve({ success: false, error: err.message });
      });

      if (proc.stdin) {
        proc.stdin.setDefaultEncoding('utf-8');
        (proc.stdin as NodeJS.WritableStream & { highWaterMark: number }).highWaterMark = 1024 * 1024; // Node writable streams support this but types don't expose it
      }
    });
  }

  /** Start continuous sync — emits deltas via callback */
  startSync(onDelta: (delta: SyncDelta) => void, onClose: (code: number | null, stderr?: string) => void): void {
    const args = ['--mode', 'sync'];
    if (this.verbose) args.push('--verbose');
    if (this.account) args.push('--info', this.account.emailAddress);

    this.ready = false;
    this.pendingMessages = [];

    const env = makeEnv();
    log.info(`mailsync [sync] starting for ${this.account.emailAddress} (LD_LIBRARY_PATH=${env.LD_LIBRARY_PATH?.slice(0, 100)})`);
    this.proc = spawn(MAILSYNC_PATH, args, {
      env,
      cwd: MAILSYNC_DIR,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (this.proc.stdin) {
      this.proc.stdin.setDefaultEncoding('utf-8');
      (this.proc.stdin as any).highWaterMark = 1024 * 1024;
    }

    // Wait for the binary's first stdout output before sending credentials.
    // The binary prints "Waiting for Account JSON:" on stdout, then reads stdin.
    // Writing to stdin before the binary is ready races the pipe — in packaged
    // builds the binary starts faster than the pipe flushes, causing code 2 exits.
    const accountData = `${serializeAccount(this.account)}\n${JSON.stringify(makeIdentity(this.account.emailAddress))}\n`;
    let credentialsSent = false;

    const sendCredentials = () => {
      if (credentialsSent || !this.proc?.stdin?.writable) return;
      credentialsSent = true;
      this.proc.stdin.write(accountData, 'utf-8', () => {
        this.ready = true;
        for (const msg of this.pendingMessages) {
          this.proc!.stdin!.write(JSON.stringify(msg) + '\n');
        }
        this.pendingMessages = [];
        log.info(`mailsync [sync] credentials sent for ${this.account.emailAddress}`);
      });
    };

    // Log raw stdout for debugging (captures even partial/non-line output)
    this.proc.stdout?.once('data', (chunk) => {
      log.info(`mailsync [sync] first stdout for ${this.account.emailAddress}: ${chunk.toString().slice(0, 200)}`);
    });

    // Parse stdout lines as JSON deltas
    const rl = readline.createInterface({ input: this.proc.stdout! });
    rl.on('line', (line) => {
      // Send credentials on first stdout (binary is ready to read)
      if (!credentialsSent) {
        sendCredentials();
      }
      try {
        const delta = JSON.parse(line) as SyncDelta;
        onDelta(delta);
      } catch {
        log.debug(`mailsync stdout (non-JSON): ${line.slice(0, 200)}`);
      }
    });

    // Fallback: if no stdout within 3s, send credentials anyway (prevents hang)
    const fallbackTimer = setTimeout(() => {
      if (!credentialsSent) {
        log.warn(`mailsync [sync] no stdout after 3s for ${this.account.emailAddress}, sending credentials anyway`);
        sendCredentials();
      }
    }, 3000);

    // Capture stderr for error reporting
    let stderrBuf = '';
    this.proc.stderr?.on('data', (chunk) => {
      const text = chunk.toString().trim();
      log.debug(`mailsync stderr: ${text}`);
      stderrBuf = (stderrBuf + '\n' + text).slice(-2000).trim(); // keep last 2KB
    });

    this.proc.on('close', (code) => {
      clearTimeout(fallbackTimer);
      log.info(`mailsync [sync] exited: code=${code}`);
      this.proc = null;
      onClose(code, stderrBuf || undefined);
    });

    this.proc.on('error', (err) => {
      log.error('mailsync [sync] error:', err);
      this.proc = null;
      onClose(1, err.message);
    });
  }

  /** Send a task to mailsync via stdin */
  sendMessage(msg: Record<string, any>): void {
    if (!this.proc?.stdin?.writable) {
      log.warn('mailsync stdin not writable, dropping message');
      return;
    }
    if (!this.ready) {
      log.info('mailsync not ready yet, queueing message');
      this.pendingMessages.push(msg);
      return;
    }
    this.proc.stdin.write(JSON.stringify(msg) + '\n');
  }

  kill(): void {
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
  }

  get isRunning(): boolean {
    return this.proc !== null;
  }

  get isReady(): boolean {
    return this.ready;
  }
}

// ── Delta types ──

export interface SyncDelta {
  type: 'persist' | 'unpersist';
  modelClass: string;
  modelJSONs: any[];
}

// ── Bridge: manages all sync processes ──

const clients: Map<string, MailsyncProcess> = new Map();
const retryCounts: Map<string, number> = new Map();
const MAX_RETRIES = 3;
const RETRY_DELAYS = [5000, 15000, 30000]; // escalating backoff

function broadcastSyncStatus(accountId: string, status: 'starting' | 'connected' | 'syncing' | 'idle' | 'error' | 'stopped', error?: string) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('sync:status', { accountId, status, error });
  }
}

// Debounce 'syncing' status per account — only send once per burst, not per delta
const syncingTimers = new Map<string, ReturnType<typeof setTimeout>>();

function broadcastSyncingDebounced(accountId: string) {
  if (syncingTimers.has(accountId)) return; // already signaled, skip
  broadcastSyncStatus(accountId, 'syncing');
  // Suppress further 'syncing' broadcasts for 2s
  const timer = setTimeout(() => syncingTimers.delete(accountId), 2000);
  syncingTimers.set(accountId, timer);
}

/** Build a user-friendly error message from mailsync exit code and stderr */
function describeError(code: number | null, stderr?: string): string {
  // Code 2 = binary didn't receive valid account credentials on stdin
  if (code === 2) return 'Sync engine failed to start — credentials not received. Retrying...';

  // Try to extract a meaningful message from stderr
  if (stderr) {
    // Common patterns from mailsync stderr
    if (stderr.includes('ENOENT') || stderr.includes('No such file'))
      return 'Sync engine not found. Check that mailsync binary is installed.';
    if (stderr.includes('EACCES') || stderr.includes('Permission denied'))
      return 'Permission denied running sync engine.';
    if (stderr.includes('authenticate') || stderr.includes('auth') || stderr.includes('credential'))
      return 'Authentication failed. Try re-adding your account.';
    if (stderr.includes('network') || stderr.includes('ECONNREFUSED') || stderr.includes('ETIMEDOUT'))
      return 'Network error. Check your internet connection.';
    // Return last meaningful line of stderr
    const lines = stderr.split('\n').filter(l => l.trim());
    if (lines.length > 0) return lines[lines.length - 1].slice(0, 200);
  }
  return `Sync engine exited unexpectedly (code ${code})`;
}

export function startSyncForAccount(account: AccountForSync): void {
  if (clients.has(account.id)) {
    log.warn(`Sync already running for ${account.emailAddress}`);
    return;
  }

  const proc = new MailsyncProcess(account);
  clients.set(account.id, proc);
  broadcastSyncStatus(account.id, 'starting');

  let hasDelta = false;

  proc.startSync(
    (delta) => {
      log.info(`[delta] ${account.emailAddress}: ${delta.type} ${delta.modelClass} (${delta.modelJSONs.length} items)`);
      // First delta = connected — reset retry counter on success
      if (!hasDelta) {
        hasDelta = true;
        retryCounts.delete(account.id);
        broadcastSyncStatus(account.id, 'connected');
      }
      // Debounced 'syncing' — avoids flooding renderer with status updates
      broadcastSyncingDebounced(account.id);
      // Broadcast delta to all renderer windows
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('sync:delta', {
          accountId: account.id,
          type: delta.type,
          modelClass: delta.modelClass,
          ids: delta.modelJSONs.map((j: any) => j.id),
          count: delta.modelJSONs.length,
        });
      }
    },
    (code, stderr) => {
      clients.delete(account.id);
      // Clean up debounce timer
      const timer = syncingTimers.get(account.id);
      if (timer) { clearTimeout(timer); syncingTimers.delete(account.id); }

      if (code !== 0) {
        const retries = retryCounts.get(account.id) || 0;
        const errorMsg = describeError(code, stderr);
        log.warn(`mailsync crashed for ${account.emailAddress}: ${errorMsg} (stderr: ${stderr?.slice(0, 500) || 'none'})`);

        if (retries < MAX_RETRIES) {
          const delay = RETRY_DELAYS[retries] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
          retryCounts.set(account.id, retries + 1);
          broadcastSyncStatus(account.id, 'error', `${errorMsg} — retrying in ${delay / 1000}s (${retries + 1}/${MAX_RETRIES})`);
          log.info(`mailsync retry ${retries + 1}/${MAX_RETRIES} for ${account.emailAddress} in ${delay / 1000}s`);
          setTimeout(() => startSyncForAccount(account), delay);
        } else {
          retryCounts.delete(account.id);
          broadcastSyncStatus(account.id, 'error', errorMsg);
          log.error(`mailsync gave up for ${account.emailAddress} after ${MAX_RETRIES} retries: ${errorMsg}`);
        }
      } else {
        broadcastSyncStatus(account.id, 'stopped');
      }
    },
  );
}

/** Manually retry sync for a specific account (called from renderer) */
export function retrySyncForAccount(accountId: string): boolean {
  // Dynamic import to avoid circular dependency (accounts imports mailsync)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const allAccounts = require('./accounts').getAllAccountsForSync();
  const account = allAccounts.find((a: AccountForSync) => a.id === accountId);
  if (!account) return false;
  retryCounts.delete(accountId);
  if (clients.has(accountId)) {
    const proc = clients.get(accountId);
    proc?.kill();
    clients.delete(accountId);
  }
  startSyncForAccount(account);
  return true;
}

/** Get current sync status for all accounts (for renderer to query on load) */
export function getSyncStatuses(): { accountId: string; status: string; ready: boolean }[] {
  const statuses: { accountId: string; status: string; ready: boolean }[] = [];
  for (const [accountId, proc] of clients) {
    statuses.push({
      accountId,
      status: proc.isReady ? 'syncing' : 'starting',
      ready: proc.isReady,
    });
  }
  return statuses;
}

export function stopSyncForAccount(accountId: string): void {
  const proc = clients.get(accountId);
  if (proc) {
    proc.kill();
    clients.delete(accountId);
  }
}

export function stopAllSync(): void {
  for (const [id, proc] of clients) {
    proc.kill();
    clients.delete(id);
  }
}

/** Normalize a task from the renderer into the format mailsync expects */
function serializeTask(accountId: string, task: Record<string, any>): Record<string, any> {
  const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const cls = task.type || task.__cls || 'Task';

  const base: Record<string, any> = {
    __cls: cls,
    id: taskId,
    aid: accountId,
    status: 'local',
    v: 1,
    threadIds: task.threadIds || [],
    messageIds: task.messageIds || [],
    isUndo: false,
    canBeUndone: true,
  };

  switch (cls) {
    case 'ChangeStarredTask':
      base.starred = task.starred;
      break;
    case 'ChangeUnreadTask':
      base.unread = task.unread;
      break;
    case 'ChangeLabelsTask':
      base.labelsToAdd = (task.labelsToAdd || []).map((l: any) => ({
        __cls: 'Label',
        id: l.id,
        aid: accountId,
        role: l.role || '',
        path: l.path || '',
        v: 1,
      }));
      base.labelsToRemove = (task.labelsToRemove || []).map((l: any) => ({
        __cls: 'Label',
        id: l.id,
        aid: accountId,
        role: l.role || '',
        path: l.path || '',
        v: 1,
      }));
      break;
    case 'ChangeFolderTask':
      if (task.folder) {
        base.folder = {
          __cls: 'Folder',
          id: task.folder.id,
          aid: accountId,
          role: task.folder.role || '',
          path: task.folder.path || '',
          v: 1,
        };
      }
      break;
    case 'SyncbackDraftTask':
    case 'SendDraftTask':
      if (task.draft) {
        base.draft = {
          __cls: 'Message',
          id: task.draft.id || `local-draft-${Date.now()}`,
          hMsgId: task.draft.headerMessageId || `<${Date.now()}.${Math.random().toString(36).slice(2)}@mailspring.com>`,
          aid: accountId,
          to: (task.draft.to || []).map((c: any) => ({ __cls: 'Contact', email: c.email, name: c.name || '' })),
          cc: (task.draft.cc || []).map((c: any) => ({ __cls: 'Contact', email: c.email, name: c.name || '' })),
          bcc: (task.draft.bcc || []).map((c: any) => ({ __cls: 'Contact', email: c.email, name: c.name || '' })),
          from: (task.draft.from || []).map((c: any) => ({ __cls: 'Contact', email: c.email, name: c.name || '' })),
          replyTo: [],
          subject: task.draft.subject || '',
          body: task.draft.body || '',
          plaintext: task.draft.plaintext ?? false,
          draft: true,
          pristine: false,
          date: task.draft.date || Math.floor(Date.now() / 1000),
          unread: false,
          starred: false,
          v: task.draft.version || 1,
          files: [],
          file_ids: [],
          threadId: task.draft.threadId || undefined,
          irtMsgId: task.draft.replyToHeaderId || undefined,
          folder: task.draft.folder ? {
            __cls: 'Folder',
            id: task.draft.folder.id,
            aid: accountId,
            role: task.draft.folder.role || 'drafts',
            path: task.draft.folder.path || '[Gmail]/Drafts',
            v: 1,
          } : undefined,
        };
        base.headerMessageId = base.draft.hMsgId;
      }
      break;
    case 'DestroyDraftTask':
      base.messageIds = task.messageIds || [];
      break;
  }

  return base;
}

export function queueTask(accountId: string, task: Record<string, any>): { sent: boolean; ready: boolean; error?: string } {
  const proc = clients.get(accountId);
  if (!proc) {
    log.warn(`[task] No sync process for account ${accountId}`);
    return { sent: false, ready: false, error: 'No sync process for account' };
  }
  if (!proc.isRunning) {
    log.warn(`[task] Sync process not running for account ${accountId}`);
    return { sent: false, ready: false, error: 'Sync process not running' };
  }
  const serialized = serializeTask(accountId, task);
  log.info(`[task] queueing ${serialized.__cls} for account ${accountId} (has draft: ${!!serialized.draft})`);
  log.debug(`[task] serialized:`, JSON.stringify(serialized).slice(0, 500));
  proc.sendMessage({ type: 'queue-task', task: serialized });
  return { sent: true, ready: proc.isReady };
}

export async function migrateDatabase(account: AccountForSync): Promise<{ success: boolean; error?: string }> {
  const proc = new MailsyncProcess(account);
  return proc.runAndWait('migrate');
}

export async function testAccount(account: AccountForSync): Promise<{ success: boolean; error?: string }> {
  const proc = new MailsyncProcess(account);
  return proc.runAndWait('test');
}
