import { useState, useEffect, useRef, useCallback } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { IoCreateOutline, IoWarningOutline, IoRefreshOutline, IoCloseOutline } from 'react-icons/io5';
import ActivityBar from './components/ActivityBar';
import Sidebar from './components/Sidebar';
import ThreadList from './components/ThreadList';
import MessageView from './components/MessageView';
import NewsletterFeed from './components/NewsletterFeed';
import UpdatesFeed from './components/UpdatesFeed';
import ReceiptsFeed from './components/ReceiptsFeed';
import CategoryTabs from './components/CategoryTabs';
import SettingsPanel from './components/SettingsPanel';
import CommandPalette from './components/CommandPalette';
import Onboarding from './components/Onboarding';
import ComposeWindow from './components/ComposeWindow';
import ViewTransition from './components/ViewTransition';
import ToastContainer from './components/Toast';
import UndoSendToast from './components/UndoSendToast';
import {
  settingsOpenAtom, viewModeAtom, selectedThreadIdAtom, activeCategoryAtom,
  hasAccountsAtom, checkAccountsAtom, loadThreadsAtom, loadMessagesAtom,
  dbReadyAtom, addingAccountAtom, loadCategoriesAtom, loadPinnedIdsAtom, isOptimisticWindow,
  updateSyncStatusAtom, activeSidebarViewAtom, composeOpenAtom,
  activeAccountIdAtom, syncStatusMapAtom, accountsAtom,
} from './atoms/app';
import type { SyncStatus } from './atoms/app';

function FeedView({ category }: { category: string }) {
  switch (category) {
    case 'newsletter':
    case 'marketing':
      return <NewsletterFeed />;
    case 'notification':
      return <UpdatesFeed />;
    case 'transactional':
      return <ReceiptsFeed />;
    default:
      return null;
  }
}

const feedCategories = new Set(['newsletter', 'marketing', 'notification', 'transactional']);

function ComposeButton() {
  const [compose, setCompose] = useAtom(composeOpenAtom);
  const selectedThreadId = useAtomValue(selectedThreadIdAtom);
  if (compose || selectedThreadId) return null;
  return (
    <button
      onClick={() => setCompose({ mode: 'new', to: [], cc: [], bcc: [], subject: '', body: '' })}
      className="fixed bottom-6 right-6 z-30 flex items-center gap-2 px-4 py-2.5 rounded-full bg-accent text-accent-text shadow-lg hover:bg-accent-hover transition-colors cursor-pointer"
      title="Compose new email"
    >
      <IoCreateOutline size={18} />
      <span className="text-sm font-medium">Compose</span>
    </button>
  );
}

function SyncErrorBanner() {
  const syncStatusMap = useAtomValue(syncStatusMapAtom);
  const accounts = useAtomValue(accountsAtom);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [retrying, setRetrying] = useState<Set<string>>(new Set());

  const errors = Array.from(syncStatusMap.entries())
    .filter(([, s]) => s.status === 'error' && !dismissed.has(s.error || ''))
    .map(([accountId, s]) => {
      const account = accounts.find(a => a.id === accountId);
      return { accountId, email: account?.email || accountId, error: s.error || 'Unknown error' };
    });

  if (errors.length === 0) return null;

  const handleRetry = async (accountId: string) => {
    if (!window.api?.retrySync) return;
    setRetrying(prev => new Set(prev).add(accountId));
    try {
      await window.api.retrySync(accountId);
    } catch { /* ignore */ }
    // The status update from main process will clear the error
    setTimeout(() => setRetrying(prev => { const next = new Set(prev); next.delete(accountId); return next; }), 2000);
  };

  const handleDismiss = (error: string) => {
    setDismissed(prev => new Set(prev).add(error));
  };

  return (
    <div className="flex flex-col gap-1 px-4 pt-2">
      {errors.map(({ accountId, email, error }) => (
        <div key={accountId} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
          <IoWarningOutline size={14} className="text-red-400 shrink-0" />
          <div className="flex-1 min-w-0 text-xs text-red-300">
            <span className="font-medium text-red-400">{email}</span>
            <span className="text-red-300/70"> — {error}</span>
          </div>
          <button
            onClick={() => handleRetry(accountId)}
            disabled={retrying.has(accountId)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xxs font-medium text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50"
          >
            <IoRefreshOutline size={11} className={retrying.has(accountId) ? 'animate-spin' : ''} />
            Retry
          </button>
          <button
            onClick={() => handleDismiss(error)}
            className="p-0.5 rounded text-red-400/50 hover:text-red-400 transition-colors cursor-pointer"
          >
            <IoCloseOutline size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

function MailApp() {
  const [settingsOpen, setSettingsOpen] = useAtom(settingsOpenAtom);
  const [addingAccount, setAddingAccount] = useAtom(addingAccountAtom);
  const compose = useAtomValue(composeOpenAtom);
  const viewMode = useAtomValue(viewModeAtom);
  const selectedThreadId = useAtomValue(selectedThreadIdAtom);
  const activeCategory = useAtomValue(activeCategoryAtom);
  const dbReady = useAtomValue(dbReadyAtom);
  const sidebarView = useAtomValue(activeSidebarViewAtom);
  const activeAccountId = useAtomValue(activeAccountIdAtom);
  const loadThreads = useSetAtom(loadThreadsAtom);
  const loadMessages = useSetAtom(loadMessagesAtom);
  const loadCategories = useSetAtom(loadCategoriesAtom);
  const loadPinnedIds = useSetAtom(loadPinnedIdsAtom);
  const updateSyncStatus = useSetAtom(updateSyncStatusAtom);
  const showFullMessage = viewMode === 'list' && selectedThreadId !== null;
  const isFeedView = feedCategories.has(activeCategory);

  // Load threads and categories when db is ready
  useEffect(() => {
    if (dbReady) {
      loadThreads();
      loadCategories();
      loadPinnedIds();
    }
  }, [dbReady, activeCategory, sidebarView, activeAccountId, loadThreads, loadCategories, loadPinnedIds]);

  // Load messages when a thread is selected
  useEffect(() => {
    if (selectedThreadId && dbReady) {
      loadMessages(selectedThreadId);
    }
  }, [selectedThreadId, dbReady, loadMessages]);

  // Listen for sync deltas to refresh data (debounced)
  // Mailsync sends rapid bursts of deltas during sync — without debouncing,
  // each delta triggers a full loadThreads(), causing 12+ re-renders in seconds.
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedLoadThreads = useCallback(() => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = setTimeout(() => {
      reloadTimerRef.current = null;
      loadThreads();
    }, 500);
  }, [loadThreads]);

  useEffect(() => {
    if (!window.api?.onSyncDelta) return;
    const unsub = window.api.onSyncDelta((delta: any) => {
      if (isOptimisticWindow()) return;
      if (delta.modelClass === 'Thread' || delta.modelClass === 'Message') {
        debouncedLoadThreads();
        // Reload messages for the currently open thread so new replies appear
        if (delta.modelClass === 'Message' && selectedThreadId) {
          loadMessages(selectedThreadId);
        }
      }
    });
    return () => {
      unsub();
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    };
  }, [debouncedLoadThreads, selectedThreadId, loadMessages]);

  // Listen for sync status updates
  useEffect(() => {
    if (!window.api?.onSyncStatus) return;
    const unsub = window.api.onSyncStatus((data: { accountId: string; status: string; error?: string }) => {
      updateSyncStatus({ accountId: data.accountId, status: data.status as SyncStatus, error: data.error });
    });
    return () => { unsub(); };
  }, [updateSyncStatus]);

  // Listen for AI classification results — refresh threads when AI re-classifies emails
  useEffect(() => {
    if (!window.api?.onAIClassificationsUpdated) return;
    const unsub = window.api.onAIClassificationsUpdated(() => {
      debouncedLoadThreads();
    });
    return () => { unsub(); };
  }, [debouncedLoadThreads]);

  return (
    <div className="flex h-screen overflow-hidden">
      <ActivityBar />
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {compose ? (
          <ComposeWindow />
        ) : (
          <>
            <CategoryTabs />
            <SyncErrorBanner />
            <div className="flex-1 flex min-h-0">
              {isFeedView ? (
                viewMode === 'split' ? (
                  <>
                    <ViewTransition viewKey={activeCategory} className="flex-1 flex min-w-0">
                      <FeedView category={activeCategory} />
                    </ViewTransition>
                    {selectedThreadId && <MessageView />}
                  </>
                ) : showFullMessage ? (
                  <ViewTransition viewKey={`msg-${selectedThreadId}`} className="flex-1 flex min-w-0">
                    <MessageView />
                  </ViewTransition>
                ) : (
                  <ViewTransition viewKey={activeCategory} className="flex-1 flex min-w-0">
                    <FeedView category={activeCategory} />
                  </ViewTransition>
                )
              ) : viewMode === 'split' ? (
                <>
                  <ThreadList />
                  <MessageView />
                </>
              ) : (
                <ViewTransition viewKey={showFullMessage ? `msg-${selectedThreadId}` : 'list'} className="flex-1 flex min-w-0">
                  {showFullMessage ? <MessageView /> : <ThreadList fullWidth />}
                </ViewTransition>
              )}
            </div>
          </>
        )}
      </div>
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      {addingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setAddingAccount(false)} />
          <div className="relative" onClick={e => e.stopPropagation()}>
            <Onboarding onComplete={() => setAddingAccount(false)} />
          </div>
        </div>
      )}
      <CommandPalette />
      <ComposeButton />
      <UndoSendToast />
      <ToastContainer />
    </div>
  );
}

export default function App() {
  const hasAccounts = useAtomValue(hasAccountsAtom);
  const checkAccounts = useSetAtom(checkAccountsAtom);

  // Check for accounts on mount
  useEffect(() => {
    checkAccounts();
  }, [checkAccounts]);

  // Re-read accounts when main process updates avatars
  useEffect(() => {
    if (!window.api?.onAccountsUpdated) return;
    const unsub = window.api.onAccountsUpdated(() => {
      checkAccounts();
    });
    return () => { unsub(); };
  }, [checkAccounts]);

  // Loading state
  if (hasAccounts === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg-primary">
        <div className="text-sm text-text-tertiary">Loading...</div>
      </div>
    );
  }

  // No accounts — show onboarding
  if (!hasAccounts) {
    return <Onboarding />;
  }

  // Main app
  return <MailApp />;
}
