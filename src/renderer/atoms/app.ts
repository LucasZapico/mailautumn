import { atom } from 'jotai';
import type { Thread, Message, Account, Contact, CategoryTab } from '../data/types';

// ── Persistence helper ──

function stored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) return JSON.parse(raw) as T;
  } catch { /* ignore */ }
  return fallback;
}

function persist<T>(key: string, value: T): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

// ── Types ──

export type ViewMode = 'split' | 'list';
export type Density = 'compact' | 'default' | 'relaxed';
export type NewsletterViewMode = 'full' | 'focused';

// ── Optimistic update guard ──
// After an optimistic write, suppress delta-triggered reloads briefly
// so mailsync deltas don't revert the UI before the DB catches up.
let optimisticUntil = 0;
export function markOptimistic() { optimisticUntil = Date.now() + 2000; }
export function isOptimisticWindow() { return Date.now() < optimisticUntil; }

// ── Core data (loaded from IPC) ──

export const accountsAtom = atom<Account[]>([]);
export const threadsAtom = atom<Thread[]>([]);

// ── Pinned threads (client-side, persisted to localStorage) ──

function loadPinnedIds(): Set<string> {
  try {
    const raw = localStorage.getItem('pinned-thread-ids');
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}
function savePinnedIds(ids: Set<string>): void {
  localStorage.setItem('pinned-thread-ids', JSON.stringify([...ids]));
}
export const pinnedThreadIdsAtom = atom<Set<string>>(loadPinnedIds());
export const hasAccountsAtom = atom<boolean | null>(null); // null = loading
export const dbReadyAtom = atom<boolean>(false);
export const addingAccountAtom = atom<boolean>(false); // show add-account flow in main app

// ── Per-account sync status ──

export type SyncStatus = 'starting' | 'connected' | 'syncing' | 'idle' | 'error' | 'stopped';

/** Map of accountId → { status, error?, lastActivity } */
export const syncStatusMapAtom = atom<Map<string, { status: SyncStatus; error?: string; lastActivity: number }>>(new Map());

/** Update sync status for one account. 'syncing' auto-decays to 'idle' after 3s of no deltas. */
export const updateSyncStatusAtom = atom(null, (get, set, update: { accountId: string; status: SyncStatus; error?: string }) => {
  const map = new Map(get(syncStatusMapAtom));
  map.set(update.accountId, {
    status: update.status,
    error: update.error,
    lastActivity: Date.now(),
  });
  set(syncStatusMapAtom, map);

  // Auto-decay 'syncing' → 'idle' after 3s of no new deltas
  if (update.status === 'syncing') {
    const ts = Date.now();
    setTimeout(() => {
      const current = get(syncStatusMapAtom).get(update.accountId);
      if (current && current.status === 'syncing' && current.lastActivity <= ts) {
        const m = new Map(get(syncStatusMapAtom));
        m.set(update.accountId, { ...current, status: 'idle' });
        set(syncStatusMapAtom, m);
      }
    }, 3000);
  }
});

// ── Navigation ──

export type SidebarView = 'inbox' | 'starred' | 'snoozed' | 'sent' | 'drafts' | 'archive' | 'spam' | 'trash';

export const activeAccountIdAtom = atom<string | null>(null);
export const activeCategoryAtom = atom<CategoryTab>('conversation');
export const activeSidebarViewAtom = atom<SidebarView | string>('inbox'); // string for label IDs
export const activeAliasFilterAtom = atom<string | null>(null); // filter by recipient alias email
export const selectedThreadIdAtom = atom<string | null>(null);
/** Create a Jotai atom that reads/writes to localStorage */
function persistedAtom<T>(key: string, fallback: T) {
  const base = atom(stored<T>(key, fallback));
  return atom(
    (get) => get(base),
    (_get, set, value: T) => { set(base, value); persist(key, value); },
  );
}

export const viewModeAtom = persistedAtom<ViewMode>('pref:viewMode', 'list');
export const densityAtom = persistedAtom<Density>('pref:density', 'default');
export const newsletterViewAtom = persistedAtom<NewsletterViewMode>('pref:newsletterView', 'full');

// ── Display toggles ──

export type AvatarStyle = 'marble' | 'beam' | 'pixel' | 'ring' | 'mono' | 'initials';

export const showLabelsAtom = persistedAtom<boolean>('pref:showLabels', true);
export const showViewsAtom = persistedAtom<boolean>('pref:showViews', true);
export const showAvatarsAtom = persistedAtom<boolean>('pref:showAvatars', true);
export const avatarStyleAtom = persistedAtom<AvatarStyle>('pref:avatarStyle', 'mono');
export const showFormattingToolbarAtom = persistedAtom<boolean>('pref:showFormattingToolbar', true);
export const showCrmPanelAtom = persistedAtom<boolean>('pref:showCrmPanel', true);

// ── Animations ──

export type AnimationSpeed = 'off' | 'fast' | 'default' | 'slow';
export const animationSpeedAtom = persistedAtom<AnimationSpeed>('pref:animationSpeed', 'default');

/** Get CSS transition duration in ms based on setting */
export const animationDurationAtom = atom((get) => {
  const speed = get(animationSpeedAtom);
  switch (speed) {
    case 'off': return 0;
    case 'fast': return 100;
    case 'default': return 200;
    case 'slow': return 400;
  }
});

// ── Compose ──

export interface ComposeState {
  mode: 'new' | 'reply' | 'forward';
  threadId?: string;
  replyToMessageId?: string;
  to: { name: string; email: string }[];
  cc: { name: string; email: string }[];
  bcc: { name: string; email: string }[];
  subject: string;
  body: string;
  fromEmail?: string;
  accountId?: string;
}

export const composeOpenAtom = atom<ComposeState | null>(null);

// ── Undo Send ──

function loadUndoSendDelay(): number {
  try {
    const raw = localStorage.getItem('undo-send-delay');
    if (raw !== null) return parseInt(raw, 10);
  } catch { /* localStorage unavailable */ }
  return 10;
}
export const undoSendDelayAtom = atom<number>(loadUndoSendDelay());
export const setUndoSendDelayAtom = atom(null, (_get, set, seconds: number) => {
  set(undoSendDelayAtom, seconds);
  localStorage.setItem('undo-send-delay', String(seconds));
});

export interface PendingSend {
  accountId: string;
  draft: Record<string, any>;
  compose: ComposeState;
  queuedAt: number;
}
export const pendingSendAtom = atom<PendingSend | null>(null);

// ── Panels ──

export const commandPaletteOpenAtom = atom<boolean>(false);
export const settingsOpenAtom = atom<boolean>(false);
export const sidebarCollapsedAtom = persistedAtom<boolean>('pref:sidebarCollapsed', false);

// ── Derived atoms ──

const densityValues = {
  compact:  { threadPy: 'py-1.5', threadGap: 'gap-2',   avatarSize: 28, fontSize: 'text-xs',  snippetLines: 1, messagePy: 'pt-2 pb-0.5', messageGap: 'gap-2' },
  default:  { threadPy: 'py-2.5', threadGap: 'gap-3',   avatarSize: 36, fontSize: 'text-sm',  snippetLines: 1, messagePy: 'pt-4 pb-1',   messageGap: 'gap-3' },
  relaxed:  { threadPy: 'py-3.5', threadGap: 'gap-3.5', avatarSize: 42, fontSize: 'text-sm',  snippetLines: 2, messagePy: 'pt-5 pb-2',   messageGap: 'gap-4' },
} as const;

export const densityConfigAtom = atom((get) => densityValues[get(densityAtom)]);

/** Filtered threads by category + account + alias, pinned first */
export const filteredThreadsAtom = atom((get) => {
  const category = get(activeCategoryAtom);
  const accountId = get(activeAccountIdAtom);
  const aliasFilter = get(activeAliasFilterAtom);
  let all = get(threadsAtom);
  if (category !== 'all') {
    all = all.filter(t => t.type === category);
  }
  if (accountId) {
    all = all.filter(t => t.accountId === accountId);
  }
  if (aliasFilter) {
    const alias = aliasFilter.toLowerCase();
    all = all.filter(t =>
      t.participants.some(p => p.email.toLowerCase() === alias)
    );
  }
  return [...all].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.lastMessageDate.getTime() - a.lastMessageDate.getTime();
  });
});

/** Set of all account emails + aliases for identifying "self" in participants */
export const accountEmailsAtom = atom((get) => {
  const emails = new Set<string>();
  for (const a of get(accountsAtom)) {
    emails.add(a.email.toLowerCase());
    for (const alias of a.aliases || []) {
      emails.add(alias.toLowerCase());
    }
  }
  return emails;
});

/** Selected thread object */
export const selectedThreadAtom = atom((get) => {
  const id = get(selectedThreadIdAtom);
  if (!id) return null;
  return get(threadsAtom).find(t => t.id === id) ?? null;
});

/** Unread count by category */
export const unreadCountAtom = atom((get) => {
  const all = get(threadsAtom);
  return (category: CategoryTab): number => {
    const list = category === 'all' ? all : all.filter(t => t.type === category);
    return list.filter(t => t.unread).length;
  };
});

/** Unread count per account — writable, survives account switches */
export const accountUnreadCountsAtom = atom<Map<string, number>>(new Map());

// ── Write atoms (actions) ──

export const selectThreadAtom = atom(null, (_get, set, id: string | null) => {
  set(selectedThreadIdAtom, id);
});

export const goBackToListAtom = atom(null, (_get, set) => {
  set(selectedThreadIdAtom, null);
});

export const togglePinAtom = atom(null, (get, set, threadId: string) => {
  const pinnedIds = new Set(get(pinnedThreadIdsAtom));
  const wasPinned = pinnedIds.has(threadId);
  if (wasPinned) pinnedIds.delete(threadId); else pinnedIds.add(threadId);
  savePinnedIds(pinnedIds);
  set(pinnedThreadIdsAtom, pinnedIds);
  set(threadsAtom, get(threadsAtom).map(t =>
    t.id === threadId ? { ...t, pinned: !wasPinned } : t
  ));
});

/** Optimistic type overrides — survives loadThreads refreshes until the DB catches up */
const localTypeOverrides = new Map<string, string>();

const typeLabels: Record<string, string> = {
  conversation: 'Conversations',
  newsletter: 'Newsletters',
  notification: 'Updates',
  transactional: 'Receipts',
  marketing: 'Promos',
  calendar: 'Calendar',
};

export const setThreadTypeAtom = atom(null, async (get, set, { threadId, type }: { threadId: string; type: string }) => {
  const threads = get(threadsAtom);
  const thread = threads.find(t => t.id === threadId);
  const prevType = thread?.type;
  // Store local override so loadThreads won't revert it
  localTypeOverrides.set(threadId, type);
  // Optimistic update in-memory
  set(threadsAtom, threads.map(t =>
    t.id === threadId ? { ...t, type: type as Thread['type'] } : t
  ));
  // Persist to main process — include sender email so it can learn a sender rule
  const senderEmail = thread?.participants?.[0]?.email;
  try {
    await window.api.setThreadType(threadId, type, senderEmail);
  } catch {
    // IPC failure — optimistic update stays until next refresh
  }
  // Toast with undo
  const { pushToast } = await import('../components/Toast');
  pushToast(`Moved to ${typeLabels[type] || type}`, prevType ? {
    label: 'Undo',
    onClick: () => {
      localTypeOverrides.set(threadId, prevType);
      set(threadsAtom, get(threadsAtom).map(t =>
        t.id === threadId ? { ...t, type: prevType as Thread['type'] } : t
      ));
      window.api?.setThreadType(threadId, prevType, senderEmail);
    },
  } : undefined);
});

export const toggleStarAtom = atom(null, (get, set, threadId: string) => {
  const thread = get(threadsAtom).find(t => t.id === threadId);
  if (!thread) return;
  // Optimistic update
  markOptimistic();
  set(threadsAtom, get(threadsAtom).map(t =>
    t.id === threadId ? { ...t, starred: !t.starred } : t
  ));
  // Queue task to mailsync
  if (window.api) {
    window.api.queueTask(thread.accountId, {
      type: 'ChangeStarredTask',
      starred: !thread.starred,
      threadIds: [threadId],
    }).catch(err => console.error('[task] fire-and-forget failed:', err));
  }
});

export const markReadAtom = atom(null, (get, set, threadId: string) => {
  const thread = get(threadsAtom).find(t => t.id === threadId);
  if (!thread) return;
  markOptimistic();
  if (thread.unread) {
    const counts = new Map(get(accountUnreadCountsAtom));
    counts.set(thread.accountId, Math.max(0, (counts.get(thread.accountId) || 0) - 1));
    set(accountUnreadCountsAtom, counts);
  }
  set(threadsAtom, get(threadsAtom).map(t =>
    t.id === threadId
      ? { ...t, unread: false, messages: t.messages.map(m => ({ ...m, unread: false })) }
      : t
  ));
  if (window.api) {
    window.api.queueTask(thread.accountId, {
      type: 'ChangeUnreadTask',
      unread: false,
      threadIds: [threadId],
    }).catch(err => console.error('[task] fire-and-forget failed:', err));
  }
});

// Category cache for folder operations (label/folder IDs per account)
interface CategoryInfo { id: string; role: string; path: string; accountId: string }
const categoriesCacheAtom = atom<CategoryInfo[]>([]);

/** Labels for the sidebar — derived from loaded categories, excluding system folders */
const SYSTEM_ROLES = new Set(['inbox', 'sent', 'drafts', 'spam', 'trash', 'all', 'archive', 'snoozed', 'important', 'starred']);
export const sidebarLabelsAtom = atom((get) => {
  const cats = get(categoriesCacheAtom);
  return cats
    .filter(c => c.role === '' || (!SYSTEM_ROLES.has(c.role) && c.path))
    .map(c => ({ id: c.id, name: c.path, accountId: c.accountId }));
});

export const loadCategoriesAtom = atom(null, async (_get, set) => {
  if (!window.api) return;
  try {
    const cats = await window.api.getCategories();
    set(categoriesCacheAtom, cats);
  } catch {
    // categories will load on next attempt
  }
});

function findCategory(categories: CategoryInfo[], accountId: string, role: string): CategoryInfo | undefined {
  return categories.find(c => c.accountId === accountId && c.role === role);
}

async function ensureCategories(get: any, set: any): Promise<CategoryInfo[]> {
  let cats = get(categoriesCacheAtom) as CategoryInfo[];
  if (cats.length === 0 && window.api) {
    try {
      cats = await window.api.getCategories();
      set(categoriesCacheAtom, cats);
    } catch { /* ignore */ }
  }
  return cats;
}

export const archiveThreadAtom = atom(null, async (get, set, threadId: string) => {
  const thread = get(threadsAtom).find(t => t.id === threadId);
  if (!thread || !window.api) return;
  const categories = await ensureCategories(get, set);
  const inboxLabel = findCategory(categories, thread.accountId, 'inbox');
  if (!inboxLabel) {
    return;
  }
  // Optimistic: remove from list
  markOptimistic();
  if (thread.unread) {
    const counts = new Map(get(accountUnreadCountsAtom));
    counts.set(thread.accountId, Math.max(0, (counts.get(thread.accountId) || 0) - 1));
    set(accountUnreadCountsAtom, counts);
  }
  set(threadsAtom, get(threadsAtom).filter(t => t.id !== threadId));
  set(selectedThreadIdAtom, null);
  // Gmail: remove inbox label
  const result = await window.api.queueTask(thread.accountId, {
    type: 'ChangeLabelsTask',
    threadIds: [threadId],
    labelsToAdd: [],
    labelsToRemove: [{ id: inboxLabel.id, role: 'inbox', path: 'INBOX' }],
  });
});

export const trashThreadAtom = atom(null, async (get, set, threadId: string) => {
  const thread = get(threadsAtom).find(t => t.id === threadId);
  if (!thread || !window.api) return;
  const categories = await ensureCategories(get, set);
  const trashFolder = findCategory(categories, thread.accountId, 'trash');
  if (!trashFolder) {
    return;
  }
  // Optimistic: remove from list
  markOptimistic();
  if (thread.unread) {
    const counts = new Map(get(accountUnreadCountsAtom));
    counts.set(thread.accountId, Math.max(0, (counts.get(thread.accountId) || 0) - 1));
    set(accountUnreadCountsAtom, counts);
  }
  set(threadsAtom, get(threadsAtom).filter(t => t.id !== threadId));
  set(selectedThreadIdAtom, null);
  // Move to trash
  window.api.queueTask(thread.accountId, {
    type: 'ChangeFolderTask',
    threadIds: [threadId],
    folder: { id: trashFolder.id, role: 'trash', path: trashFolder.path },
  }).catch(() => {});
});

export const markUnreadAtom = atom(null, (get, set, threadId: string) => {
  const thread = get(threadsAtom).find(t => t.id === threadId);
  if (!thread || !window.api) return;
  markOptimistic();
  if (!thread.unread) {
    const counts = new Map(get(accountUnreadCountsAtom));
    counts.set(thread.accountId, (counts.get(thread.accountId) || 0) + 1);
    set(accountUnreadCountsAtom, counts);
  }
  set(threadsAtom, get(threadsAtom).map(t =>
    t.id === threadId ? { ...t, unread: true } : t
  ));
  window.api.queueTask(thread.accountId, {
    type: 'ChangeUnreadTask',
    unread: true,
    threadIds: [threadId],
  }).catch(() => {});
});

export const setActiveCategoryAtom = atom(null, (_get, set, cat: CategoryTab) => {
  set(activeCategoryAtom, cat);
  set(selectedThreadIdAtom, null);
});

export const setSidebarViewAtom = atom(null, (_get, set, view: SidebarView | string) => {
  set(activeSidebarViewAtom, view);
  set(activeAliasFilterAtom, null);
  set(selectedThreadIdAtom, null);
});

export const setAliasFilterAtom = atom(null, (_get, set, alias: string | null) => {
  set(activeAliasFilterAtom, alias);
  set(selectedThreadIdAtom, null);
});

export const setActiveAccountAtom = atom(null, (_get, set, id: string | null) => {
  set(activeAccountIdAtom, id);
  set(activeAliasFilterAtom, null);
  set(selectedThreadIdAtom, null);
});

// ── Data loading actions ──

/** Resolve sidebar view to getThreads query params */
function resolveViewQuery(
  view: SidebarView | string,
  categories: CategoryInfo[],
  accountId: string | null,
): { categoryId?: string; starred?: boolean } {
  // Map sidebar views to folder roles
  const roleMap: Record<string, string> = {
    sent: 'sent',
    drafts: 'drafts',
    spam: 'spam',
    trash: 'trash',
    archive: 'all', // Gmail "All Mail"
    snoozed: 'snoozed',
  };

  if (view === 'inbox') return {}; // default — getThreads already queries inbox
  if (view === 'starred') return { starred: true };

  const role = roleMap[view];
  if (role) {
    // Find the category ID for this role (optionally scoped by account)
    const cat = accountId
      ? categories.find(c => c.role === role && c.accountId === accountId)
      : categories.find(c => c.role === role);
    if (cat) return { categoryId: cat.id };
    return {}; // role not found — fall back to inbox
  }

  // Otherwise it's a label ID
  return { categoryId: view };
}

/** Load threads from the database via IPC */
export const loadThreadsAtom = atom(null, async (get, set) => {
  if (!window.api) return;
  try {
    const accountId = get(activeAccountIdAtom);
    const sidebarView = get(activeSidebarViewAtom);
    const categories = get(categoriesCacheAtom);
    const viewQuery = resolveViewQuery(sidebarView, categories, accountId);
    const dbThreads = await window.api.getThreads({
      accountId: accountId || undefined,
      limit: 200,
      ...viewQuery,
    });
    const pinnedIds = get(pinnedThreadIdsAtom);
    // Preserve already-loaded messages so open threads don't flash empty
    const prevThreads = get(threadsAtom);
    const prevMessagesMap = new Map<string, Message[]>();
    for (const t of prevThreads) {
      if (t.messages.length > 0) prevMessagesMap.set(t.id, t.messages);
    }
    const threads: Thread[] = dbThreads.map((t: any) => ({
      id: t.id,
      accountId: t.accountId,
      subject: t.subject,
      snippet: t.snippet,
      participants: t.participants as Contact[],
      lastMessageDate: new Date(t.lastMessageDate),
      messageCount: t.messageCount,
      unread: t.unread,
      starred: t.starred,
      pinned: pinnedIds.has(t.id),
      labels: t.labels || [],
      type: (localTypeOverrides.get(t.id) || t.emailType || 'conversation') as Thread['type'],
      messages: prevMessagesMap.get(t.id) || [],
      meta: t.meta,
    }));
    set(threadsAtom, threads);

    // Update unread counts — merge so other accounts' counts survive filtering
    const prevCounts = get(accountUnreadCountsAtom);
    const newCounts = new Map(prevCounts);
    // Compute counts from loaded threads (which may be filtered to one account)
    const loadedAccounts = new Set<string>();
    const loadedCounts = new Map<string, number>();
    for (const t of threads) {
      loadedAccounts.add(t.accountId);
      if (t.unread) {
        loadedCounts.set(t.accountId, (loadedCounts.get(t.accountId) || 0) + 1);
      }
    }
    // Only update counts for accounts present in this load (preserve others)
    for (const aid of loadedAccounts) {
      newCounts.set(aid, loadedCounts.get(aid) || 0);
    }
    set(accountUnreadCountsAtom, newCounts);
  } catch {
    // thread load failed — will retry on next navigation
  }
});

/** Load messages for a thread */
export const loadMessagesAtom = atom(null, async (get, set, threadId: string) => {
  if (!window.api) return;
  try {
    const dbMessages = await window.api.getMessages(threadId);
    const messages: Message[] = dbMessages.map((m: any) => ({
      id: m.id,
      threadId: m.threadId,
      headerMessageId: m.headerMessageId || undefined,
      from: m.from as Contact,
      to: m.to as Contact[],
      cc: m.cc as Contact[],
      subject: m.subject,
      body: m.body,
      snippet: m.snippet,
      date: new Date(m.date),
      unread: m.unread,
      starred: m.starred,
      draft: m.draft,
      attachments: (m.attachments || []).length > 0 ? m.attachments : undefined,
    }));
    // Update the thread's messages
    set(threadsAtom, get(threadsAtom).map(t =>
      t.id === threadId ? { ...t, messages } : t
    ));
  } catch {
    // message load failed — will retry on thread select
  }
});

/** Check if there are accounts configured */
export const checkAccountsAtom = atom(null, async (_get, set) => {
  if (!window.api) {
    set(hasAccountsAtom, false);
    return;
  }
  try {
    const accounts = await window.api.getAccounts();
    set(hasAccountsAtom, accounts.length > 0);
    const mappedAccounts = accounts.map((a: any) => ({
      id: a.id,
      name: a.name || a.emailAddress,
      email: a.emailAddress,
      provider: a.provider || 'other',
      color: '#4a9eff',
      unreadCount: 0,
      avatarUrl: a.avatarUrl || null,
      aliases: [] as string[],
    }));
    set(accountsAtom, mappedAccounts);

    const dbOpen = await window.api.isDbOpen();
    set(dbReadyAtom, dbOpen);

    // Detect aliases for each account (async, non-blocking)
    if (dbOpen && window.api.detectAliases) {
      for (const acct of mappedAccounts) {
        window.api.detectAliases(acct.id, acct.email).then((aliases: string[]) => {
          if (aliases.length > 0) {
            set(accountsAtom, (prev: Account[]) =>
              prev.map(a => a.id === acct.id ? { ...a, aliases } : a)
            );
          }
        }).catch(err => console.error('[task] fire-and-forget failed:', err));
      }
    }

    // Hydrate current sync statuses
    if (window.api.getSyncStatuses) {
      try {
        const statuses = await window.api.getSyncStatuses();
        const map = new Map<string, { status: SyncStatus; error?: string; lastActivity: number }>();
        for (const s of statuses) {
          map.set(s.accountId, { status: s.status as SyncStatus, lastActivity: Date.now() });
        }
        set(syncStatusMapAtom, map);
      } catch { /* ignore */ }
    }
  } catch {
    set(hasAccountsAtom, false);
  }
});
