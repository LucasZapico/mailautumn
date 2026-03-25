import { useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { IoMailOutline, IoSettingsOutline, IoSyncOutline, IoWarningOutline, IoSparklesOutline } from 'react-icons/io5';
import { accountsAtom, activeAccountIdAtom, setActiveAccountAtom, settingsOpenAtom, syncStatusMapAtom, addingAccountAtom, accountUnreadCountsAtom, aiStatusAtom } from '../atoms/app';
import type { SyncStatus } from '../atoms/app';

const providerIcons: Record<string, string> = {
  gmail: 'G', outlook: 'O', yahoo: 'Y', icloud: 'i', other: '@',
};

function SyncIndicator({ status }: { status?: { status: SyncStatus; error?: string } }) {
  if (!status) return null;
  const s = status.status;
  if (s === 'idle' || s === 'stopped') return null;
  if (s === 'error') {
    return (
      <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center ring-2 ring-bg-primary animate-pulse" title={status.error || 'Sync error'}>
        <IoWarningOutline size={10} className="text-white" />
      </div>
    );
  }
  // starting / connected / syncing
  return (
    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-bg-primary rounded-full flex items-center justify-center">
      <IoSyncOutline size={10} className="text-accent animate-spin" />
    </div>
  );
}

function AccountImg({ avatarUrl, fallback }: { avatarUrl?: string | null; fallback: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (!avatarUrl || failed) return <>{fallback}</>;

  return (
    <>
      {!loaded && <span className="absolute">{fallback}</span>}
      <img
        src={avatarUrl}
        alt=""
        className={`w-full h-full object-cover transition-opacity ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        referrerPolicy="no-referrer"
      />
    </>
  );
}

function AIStatusIndicator() {
  const aiStatus = useAtomValue(aiStatusAtom);

  // Hide entirely when we haven't checked yet (brief flash on mount)
  if (aiStatus.status === 'unchecked') return null;

  const isError = aiStatus.status === 'error';
  const isChecking = aiStatus.status === 'checking';
  const isConnected = aiStatus.status === 'connected';
  const isDisabled = aiStatus.status === 'disabled';

  const title = isError
    ? `AI error: ${aiStatus.error}`
    : isChecking ? 'Checking AI connection...'
    : isDisabled ? 'AI sorting disabled'
    : 'AI connected';

  return (
    <div
      className={`w-10 h-10 rounded-xl flex items-center justify-center mb-1 relative
        ${isError ? 'text-red-400 hover:bg-red-500/10' : isConnected ? 'text-accent hover:bg-bg-hover' : 'text-text-tertiary hover:bg-bg-hover'}`}
      title={title}
    >
      <IoSparklesOutline size={16} className={isChecking ? 'animate-pulse' : ''} />
      {isError && (
        <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />
      )}
      {isConnected && (
        <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-green-500" />
      )}
    </div>
  );
}

export default function ActivityBar() {
  const accounts = useAtomValue(accountsAtom);
  const activeAccountId = useAtomValue(activeAccountIdAtom);
  const setActiveAccount = useSetAtom(setActiveAccountAtom);
  const setSettingsOpen = useSetAtom(settingsOpenAtom);
  const setAddingAccount = useSetAtom(addingAccountAtom);
  const syncStatusMap = useAtomValue(syncStatusMapAtom);
  const unreadCounts = useAtomValue(accountUnreadCountsAtom);

  return (
    <div className="flex flex-col items-center w-14 bg-bg-primary border-r border-border-secondary py-3 shrink-0">
      {/* All Inboxes */}
      <button
        onClick={() => setActiveAccount(null)}
        className={`relative w-10 h-10 rounded-xl flex items-center justify-center mb-2 transition-all duration-150 cursor-pointer
          ${activeAccountId === null ? 'bg-accent text-accent-text' : 'bg-bg-tertiary text-text-secondary hover:bg-bg-hover hover:text-text-primary'}`}
        title="All Inboxes"
      >
        <IoMailOutline size={18} />
        {activeAccountId === null && (
          <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-5 bg-white rounded-r-full" />
        )}
        {(() => {
          let total = 0;
          unreadCounts.forEach(v => { total += v; });
          return total > 0 ? (
            <div className="badge-unread absolute -top-0.5 -right-0.5 min-w-4 h-4 bg-accent text-accent-text text-2xs font-bold rounded-full flex items-center justify-center px-1">
              {total}
            </div>
          ) : null;
        })()}
      </button>

      <div className="w-6 h-px bg-border-primary my-1" />

      {/* Account icons */}
      {accounts.map(account => {
        const syncStatus = syncStatusMap.get(account.id);
        const unread = unreadCounts.get(account.id) || 0;
        return (
          <div key={account.id} className="relative my-0.5">
            <button
              onClick={() => setActiveAccount(account.id)}
              className={`account-icon w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150 text-xs font-semibold cursor-pointer overflow-hidden
                ${activeAccountId === account.id ? 'ring-2 ring-white/30' : 'hover:ring-1 hover:ring-white/10'}`}
              style={{ backgroundColor: account.color + '22', color: account.color }}
              title={`${account.name} (${account.email})${syncStatus ? ` — ${syncStatus.status}` : ''}${unread ? ` — ${unread} unread` : ''}`}
            >
              <AccountImg avatarUrl={account.avatarUrl} fallback={providerIcons[account.provider] || '@'} />
            </button>
            {activeAccountId === account.id && (
              <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full" style={{ backgroundColor: account.color }} />
            )}
            {unread > 0 && (
              <div className="absolute -top-1 -right-1 min-w-4 h-4 bg-accent text-accent-text text-2xs font-bold rounded-full flex items-center justify-center px-1 pointer-events-none">
                {unread}
              </div>
            )}
            <SyncIndicator status={syncStatus} />
          </div>
        );
      })}

      <div className="flex-1" />

      {/* AI status */}
      <AIStatusIndicator />

      {/* Add account button */}
      <button
        onClick={() => setAddingAccount(true)}
        className="w-10 h-10 rounded-xl flex items-center justify-center text-text-tertiary hover:text-text-secondary hover:bg-bg-hover transition-colors cursor-pointer mb-1"
        title="Add account"
      >
        <span className="text-lg leading-none">+</span>
      </button>

      {/* Settings */}
      <button
        onClick={() => setSettingsOpen(true)}
        className="w-10 h-10 rounded-xl flex items-center justify-center text-text-tertiary hover:text-text-secondary hover:bg-bg-hover transition-colors cursor-pointer"
        title="Settings"
      >
        <IoSettingsOutline size={18} />
      </button>
    </div>
  );
}
