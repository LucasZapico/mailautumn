import { contextBridge, ipcRenderer } from 'electron';

const api = {
  // Database queries
  getThreads: (options?: { accountId?: string; limit?: number; offset?: number; categoryId?: string; starred?: boolean; recipientEmail?: string }) =>
    ipcRenderer.invoke('db:get-threads', options),
  getMessages: (threadId: string) =>
    ipcRenderer.invoke('db:get-messages', threadId),
  getMessageIds: (threadId: string) =>
    ipcRenderer.invoke('db:get-message-ids', threadId),
  getMessageBody: (messageId: string) =>
    ipcRenderer.invoke('db:get-message-body', messageId),
  getCategories: (accountId?: string) =>
    ipcRenderer.invoke('db:get-categories', accountId),
  getThreadCount: (accountId?: string) =>
    ipcRenderer.invoke('db:get-thread-count', accountId),
  isDbOpen: () =>
    ipcRenderer.invoke('db:is-open'),

  // Account management
  getAccounts: () =>
    ipcRenderer.invoke('accounts:list'),
  addAccount: (accountData: any) =>
    ipcRenderer.invoke('accounts:add', accountData),
  removeAccount: (accountId: string) =>
    ipcRenderer.invoke('accounts:remove', accountId),

  // OAuth sign-in (two-step: begin returns URL, await waits for callback)
  beginOAuth: (provider: 'gmail' | 'outlook') =>
    ipcRenderer.invoke('oauth:begin', provider),
  awaitOAuth: () =>
    ipcRenderer.invoke('oauth:await'),
  cancelOAuth: () =>
    ipcRenderer.invoke('oauth:cancel'),
  openExternal: (url: string) =>
    ipcRenderer.invoke('shell:open-external', url),

  // Sync control
  getSyncStatuses: () =>
    ipcRenderer.invoke('sync:statuses'),
  startSync: () =>
    ipcRenderer.invoke('sync:start-all'),
  stopSync: () =>
    ipcRenderer.invoke('sync:stop-all'),
  retrySync: (accountId: string) =>
    ipcRenderer.invoke('sync:retry', accountId),

  // Tasks (write operations)
  queueTask: (accountId: string, task: any) =>
    ipcRenderer.invoke('task:queue', { accountId, task }),

  // AI Classification
  getAISettings: () =>
    ipcRenderer.invoke('ai:get-settings'),
  saveAISettings: (settings: any) =>
    ipcRenderer.invoke('ai:save-settings', settings),
  testAIConnection: (settings: any) =>
    ipcRenderer.invoke('ai:test-connection', settings),
  checkAIConnection: () =>
    ipcRenderer.invoke('ai:check-connection'),
  onAIStatus: (callback: (data: { status: string; error?: string }) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('ai:status', handler);
    return () => ipcRenderer.removeListener('ai:status', handler);
  },
  onAIClassificationsUpdated: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('ai:classifications-updated', handler);
    return () => ipcRenderer.removeListener('ai:classifications-updated', handler);
  },

  // Thread Analysis
  analyzeThread: (threadId: string, messages: { from: string; date: string; snippet: string }[], messageCount: number) =>
    ipcRenderer.invoke('ai:analyze-thread', threadId, messages, messageCount),
  getThreadAnalysis: (threadId: string, messageCount: number) =>
    ipcRenderer.invoke('ai:get-thread-analysis', threadId, messageCount),

  // Aliases
  detectAliases: (accountId: string, primaryEmail: string) =>
    ipcRenderer.invoke('db:detect-aliases', accountId, primaryEmail),

  // Contact search (compose autocomplete)
  searchContacts: (query: string, accountId?: string, limit?: number) =>
    ipcRenderer.invoke('db:search-contacts', query, accountId, limit),
  // Full-text search (threads + contacts)
  searchAll: (query: string, limit?: number) =>
    ipcRenderer.invoke('db:search-all', query, limit),

  // AI Compose
  draftWithAI: (req: { mode: 'reply' | 'new' | 'rewrite'; threadMessages?: { from: string; date: string; body: string }[]; subject?: string; to?: string[]; existingBody?: string; instruction?: string; tone?: string; senderName?: string }) =>
    ipcRenderer.invoke('ai:draft', req),

  // Manual type overrides
  setThreadType: (threadId: string, type: string, senderEmail?: string) =>
    ipcRenderer.invoke('thread:set-type', threadId, type, senderEmail),
  setDomainType: (domain: string, type: string) =>
    ipcRenderer.invoke('thread:set-domain-type', domain, type),
  getSenderRules: () =>
    ipcRenderer.invoke('thread:get-sender-rules'),
  removeSenderRule: (key: string) =>
    ipcRenderer.invoke('thread:remove-sender-rule', key),
  clearThreadOverrides: () =>
    ipcRenderer.invoke('thread:clear-overrides'),
  resetThreadType: (threadId: string) =>
    ipcRenderer.invoke('thread:reset-type', threadId),

  // Attachments
  openAttachment: (fileId: string) =>
    ipcRenderer.invoke('attachment:open', fileId),
  saveAttachment: (fileId: string, defaultName: string) =>
    ipcRenderer.invoke('attachment:save', fileId, defaultName),

  // Event listeners
  onSyncDelta: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('sync:delta', handler);
    return () => ipcRenderer.removeListener('sync:delta', handler);
  },
  onSyncStatus: (callback: (data: { accountId: string; status: string; error?: string }) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('sync:status', handler);
    return () => ipcRenderer.removeListener('sync:status', handler);
  },
  onAccountsUpdated: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('accounts-updated', handler);
    return () => ipcRenderer.removeListener('accounts-updated', handler);
  },

  // Pinned threads
  getPinnedIds: () =>
    ipcRenderer.invoke('pins:get'),
  setPinnedIds: (ids: string[]) =>
    ipcRenderer.invoke('pins:set', ids),

  // Signatures
  getSignature: (email: string) =>
    ipcRenderer.invoke('signatures:get', email),
  setSignature: (email: string, html: string) =>
    ipcRenderer.invoke('signatures:set', email, html),
  getAllSignatures: () =>
    ipcRenderer.invoke('signatures:all'),

  // CRM
  crmGetContact: (email: string) =>
    ipcRenderer.invoke('crm:get-contact', email),
  crmUpsertContact: (contact: any) =>
    ipcRenderer.invoke('crm:upsert-contact', contact),
  crmDeleteContact: (email: string) =>
    ipcRenderer.invoke('crm:delete-contact', email),
  crmSearchContacts: (query: string, limit?: number) =>
    ipcRenderer.invoke('crm:search-contacts', query, limit),
  crmAllContacts: (limit?: number) =>
    ipcRenderer.invoke('crm:all-contacts', limit),
  crmContactsByTag: (tag: string, limit?: number) =>
    ipcRenderer.invoke('crm:contacts-by-tag', tag, limit),
  crmTags: () =>
    ipcRenderer.invoke('crm:tags'),
  crmRenameTag: (oldName: string, newName: string) =>
    ipcRenderer.invoke('crm:rename-tag', oldName, newName),
  crmDeleteTag: (name: string) =>
    ipcRenderer.invoke('crm:delete-tag', name),
  crmAddInteraction: (contactEmail: string, threadId: string, subject: string, direction: 'sent' | 'received', date: string) =>
    ipcRenderer.invoke('crm:add-interaction', contactEmail, threadId, subject, direction, date),
  crmGetInteractions: (contactEmail: string, limit?: number) =>
    ipcRenderer.invoke('crm:get-interactions', contactEmail, limit),
  crmContactsForThread: (threadId: string) =>
    ipcRenderer.invoke('crm:contacts-for-thread', threadId),

  // Logs
  openLogFolder: () =>
    ipcRenderer.invoke('logs:open-folder'),
  getRecentLogs: (lines?: number) =>
    ipcRenderer.invoke('logs:get-recent', lines),

  platform: process.platform,
};

contextBridge.exposeInMainWorld('api', api);

export type ElectronAPI = typeof api;
