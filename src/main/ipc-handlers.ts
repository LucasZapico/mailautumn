import { ipcMain, shell, dialog, BrowserWindow } from 'electron';
import log from 'electron-log/main';
import fs from 'fs';
import path from 'path';
import * as database from './database';
import * as accounts from './accounts';
import * as mailsync from './mailsync';
import { beginOAuth, awaitOAuth, cancelOAuth } from './oauth';
import { getAISettings, saveAISettings, loadAISettings, testAIConnection } from './ai-classify';
import { setOverride, removeOverride } from './manual-overrides';
import { analyzeThread, getCachedAnalysis } from './ai-thread';
import { generateDraft } from './ai-compose';
import type { AISettings } from './ai-classify';
import type { ComposeAIRequest } from './ai-compose';

export function registerIpcHandlers(): void {
  // ── Database queries ──

  ipcMain.handle('db:get-threads', (_event, options) => {
    return database.getThreads(options || {});
  });

  ipcMain.handle('db:get-messages', (_event, threadId: string) => {
    return database.getMessages(threadId);
  });

  ipcMain.handle('db:get-message-body', (_event, messageId: string) => {
    return database.getMessageBody(messageId);
  });

  ipcMain.handle('db:get-categories', (_event, accountId?: string) => {
    return database.getCategories(accountId);
  });

  ipcMain.handle('db:get-thread-count', (_event, accountId?: string) => {
    return database.getThreadCount(accountId);
  });

  ipcMain.handle('db:is-open', () => {
    const open = database.isOpen();
    log.info(`db:is-open -> ${open}`);
    return open;
  });

  // ── Account management ──

  ipcMain.handle('accounts:list', () => {
    return accounts.getAccounts();
  });

  ipcMain.handle('accounts:add', async (_event, accountData) => {
    try {
      // 1. Save the account
      const fullAccount = accounts.addAccount(accountData);

      // 2. Run migration
      log.info(`Running migration for ${fullAccount.emailAddress}...`);
      const migrateResult = await mailsync.migrateDatabase(fullAccount);
      if (!migrateResult.success) {
        accounts.removeAccount(fullAccount.id);
        return { success: false, error: `Migration failed: ${migrateResult.error}` };
      }

      // 3. Test connectivity
      log.info(`Testing connectivity for ${fullAccount.emailAddress}...`);
      const testResult = await mailsync.testAccount(fullAccount);
      if (!testResult.success) {
        accounts.removeAccount(fullAccount.id);
        return { success: false, error: `Connection test failed: ${testResult.error}` };
      }

      // 4. Open/reopen database
      database.reopenDatabase();

      // 5. Start sync
      mailsync.startSyncForAccount(fullAccount);

      return { success: true, account: { id: fullAccount.id, emailAddress: fullAccount.emailAddress, name: fullAccount.name } };
    } catch (err: any) {
      log.error('Account add failed:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('accounts:remove', (_event, accountId: string) => {
    mailsync.stopSyncForAccount(accountId);
    accounts.removeAccount(accountId);
    return { success: true };
  });

  // ── OAuth sign-in ──

  // Step 1: Start callback server and return auth URL
  ipcMain.handle('oauth:begin', async (_event, provider: 'gmail' | 'outlook') => {
    try {
      log.info(`Preparing OAuth for ${provider}...`);
      const url = await beginOAuth(provider);
      return { success: true, url };
    } catch (err: any) {
      log.error('OAuth begin failed:', err);
      return { success: false, error: err.message };
    }
  });

  // Step 2: Wait for callback, then save account + migrate + test + sync
  ipcMain.handle('oauth:await', async () => {
    try {
      const oauthResult = await awaitOAuth();

      const fullAccount = accounts.addAccount({
        name: oauthResult.name,
        emailAddress: oauthResult.emailAddress,
        provider: oauthResult.provider,
        settings: oauthResult.settings,
        refreshToken: oauthResult.refreshToken,
        avatarUrl: oauthResult.avatarUrl,
      });

      log.info(`Running migration for ${fullAccount.emailAddress}...`);
      const migrateResult = await mailsync.migrateDatabase(fullAccount);
      if (!migrateResult.success) {
        accounts.removeAccount(fullAccount.id);
        return { success: false, error: `Migration failed: ${migrateResult.error}` };
      }

      // Skip test step for OAuth — credentials already validated by token exchange
      database.reopenDatabase();
      mailsync.startSyncForAccount(fullAccount);

      return { success: true, account: { id: fullAccount.id, emailAddress: fullAccount.emailAddress, name: fullAccount.name } };
    } catch (err: any) {
      log.error('OAuth flow failed:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('oauth:cancel', () => {
    cancelOAuth();
    return { success: true };
  });

  // ── Sync control ──

  ipcMain.handle('sync:statuses', () => {
    return mailsync.getSyncStatuses();
  });

  ipcMain.handle('sync:start-all', () => {
    const allAccounts = accounts.getAllAccountsForSync();
    for (const acct of allAccounts) {
      mailsync.startSyncForAccount(acct);
    }
    return { started: allAccounts.length };
  });

  ipcMain.handle('sync:stop-all', () => {
    mailsync.stopAllSync();
    return { success: true };
  });

  ipcMain.handle('sync:retry', (_event, accountId: string) => {
    return { success: mailsync.retrySyncForAccount(accountId) };
  });

  // ── Tasks (write operations) ──

  ipcMain.handle('task:queue', (_event, { accountId, task }) => {
    const result = mailsync.queueTask(accountId, task);
    return result;
  });

  // ── Aliases ──

  ipcMain.handle('db:detect-aliases', (_event, accountId: string, primaryEmail: string) => {
    return database.detectAliases(accountId, primaryEmail);
  });

  ipcMain.handle('db:search-contacts', (_event, query: string, accountId?: string, limit?: number) => {
    return database.searchContacts(query, accountId, limit);
  });

  ipcMain.handle('db:search-all', (_event, query: string, limit?: number) => {
    return database.searchAll(query, limit);
  });

  // ── AI Classification ──

  ipcMain.handle('ai:get-settings', () => {
    return getAISettings();
  });

  ipcMain.handle('ai:save-settings', (_event, settings: AISettings) => {
    saveAISettings(settings);
    return { success: true };
  });

  ipcMain.handle('ai:test-connection', async (_event, settings: AISettings) => {
    return testAIConnection(settings);
  });

  // ── Thread Analysis ──

  ipcMain.handle('ai:analyze-thread', async (_event, threadId: string, messages: { from: string; date: string; snippet: string }[], messageCount: number) => {
    // Return cached result instantly if available
    const cached = getCachedAnalysis(threadId, messageCount);
    if (cached) return { analysis: cached };
    // Otherwise analyze async
    const aiSettings = getAISettings();
    return analyzeThread(threadId, messages, aiSettings);
  });

  ipcMain.handle('ai:get-thread-analysis', (_event, threadId: string, messageCount: number) => {
    const cached = getCachedAnalysis(threadId, messageCount);
    return cached ? { analysis: cached } : null;
  });

  // ── AI Compose ──

  ipcMain.handle('ai:draft', async (_event, req: ComposeAIRequest) => {
    const aiSettings = getAISettings();
    return generateDraft(req, aiSettings);
  });

  // ── Manual type overrides ──

  ipcMain.handle('thread:set-type', (_event, threadId: string, type: string, senderEmail?: string) => {
    setOverride(threadId, type as any, senderEmail);
    return { success: true };
  });

  ipcMain.handle('thread:reset-type', (_event, threadId: string) => {
    removeOverride(threadId);
    return { success: true };
  });

  // ── Attachments ──

  ipcMain.handle('attachment:open', (_event, fileId: string) => {
    const filePath = database.getFilePath(fileId);
    if (!filePath || !fs.existsSync(filePath)) {
      return { success: false, error: 'File not found' };
    }
    shell.openPath(filePath);
    return { success: true };
  });

  ipcMain.handle('attachment:save', async (_event, fileId: string, defaultName: string) => {
    const filePath = database.getFilePath(fileId);
    if (!filePath || !fs.existsSync(filePath)) {
      return { success: false, error: 'File not found' };
    }
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showSaveDialog(win!, {
      defaultPath: path.join(require('os').homedir(), 'Downloads', defaultName),
    });
    if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' };
    try {
      fs.copyFileSync(filePath, result.filePath);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ── Shell ──

  ipcMain.handle('shell:open-external', (_event, url: string) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
  });

  // ── Logs ──

  ipcMain.handle('logs:open-folder', () => {
    const logPath = log.transports.file.getFile().path;
    const logDir = path.dirname(logPath);
    shell.openPath(logDir);
    return { success: true };
  });

  ipcMain.handle('logs:get-recent', (_event, lines: number = 200) => {
    try {
      const logPath = log.transports.file.getFile().path;
      const content = fs.readFileSync(logPath, 'utf-8');
      const allLines = content.split('\n');
      return allLines.slice(-lines).join('\n');
    } catch (err: any) {
      return `Error reading logs: ${err.message}`;
    }
  });

  log.info('IPC handlers registered');
}
