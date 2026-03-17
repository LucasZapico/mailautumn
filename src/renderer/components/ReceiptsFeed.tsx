import { useState, useMemo, memo } from 'react';
import {
  IoStar, IoStarOutline, IoArchiveOutline, IoTrashOutline, IoCheckmark,
  IoOpenOutline, IoTimeOutline, IoCardOutline, IoCubeOutline,
  IoLocationOutline, IoShieldOutline, IoCarOutline, IoRefreshOutline,
} from 'react-icons/io5';
import { useAtomValue, useSetAtom } from 'jotai';
import { filteredThreadsAtom, toggleStarAtom, markReadAtom, archiveThreadAtom, trashThreadAtom, selectThreadAtom, loadMessagesAtom } from '../atoms/app';
import type { Thread, ThreadMeta } from '../data/types';
import Avatar from './Avatar';

function formatTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const typeIcons: Record<string, React.ElementType> = {
  payment: IoCardOutline,
  shipping: IoCubeOutline,
  delivery: IoLocationOutline,
  security: IoShieldOutline,
  ride: IoCarOutline,
  subscription: IoRefreshOutline,
};

const typeLabels: Record<string, string> = {
  payment: 'Payment',
  shipping: 'Shipping',
  delivery: 'Delivery',
  security: 'Security',
  ride: 'Ride',
  subscription: 'Subscription',
};

type TransactionMeta = Extract<ThreadMeta, { kind: 'transaction' }>;

// ── Receipt Card ──

const ReceiptCard = memo(function ReceiptCard({ thread }: { thread: Thread }) {
  const selectThread = useSetAtom(selectThreadAtom);
  const loadMessages = useSetAtom(loadMessagesAtom);
  const toggleStar = useSetAtom(toggleStarAtom);
  const markRead = useSetAtom(markReadAtom);
  const archiveThread = useSetAtom(archiveThreadAtom);
  const trashThread = useSetAtom(trashThreadAtom);
  const meta = thread.meta as TransactionMeta | undefined;
  const sender = thread.participants[0];

  const openThread = () => {
    selectThread(thread.id);
    loadMessages(thread.id);
    if (thread.unread) markRead(thread.id);
  };

  if (!meta || meta.kind !== 'transaction') {
    return (
      <div onClick={openThread} className="group flex gap-3 p-4 rounded-lg border border-border-secondary hover:border-border-primary/80 transition-colors cursor-pointer">
        <Avatar contact={sender} size={28} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text-primary truncate">{thread.subject}</p>
          <p className="text-xs text-text-secondary truncate mt-0.5">{thread.snippet}</p>
        </div>
      </div>
    );
  }

  const TypeIcon = typeIcons[meta.type] || IoCardOutline;
  const label = typeLabels[meta.type] || meta.type;

  return (
    <div onClick={openThread} className={`group relative rounded-lg border border-border-secondary hover:border-border-primary/80 transition-colors overflow-hidden cursor-pointer ${thread.unread ? 'bg-bg-secondary/40' : ''}`}>
      {/* Status stripe at top */}
      <div className="h-0.5" style={{ backgroundColor: meta.statusColor }} />

      <div className="p-4">
        {/* Header: type icon + label + status/time OR quick actions on hover */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TypeIcon size={16} style={{ color: meta.statusColor }} />
            <span className="text-xxs font-semibold uppercase tracking-wider text-text-tertiary">{label}</span>
            <span className="text-xxs text-text-tertiary">·</span>
            <span className="text-xxs text-text-tertiary">{sender.name}</span>
            {thread.unread && <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 group-hover:hidden" />}
            {thread.starred && <IoStar size={12} className="fill-yellow text-yellow group-hover:hidden" />}
          </div>
          {/* Status + time (hidden on hover) */}
          <div className="flex items-center gap-2 group-hover:hidden">
            <span
              className="text-xxs font-medium px-2 py-0.5 rounded-full"
              style={{ color: meta.statusColor, backgroundColor: meta.statusColor + '1a' }}
            >
              {meta.statusLabel}
            </span>
            <span className="text-xxs text-text-tertiary">{formatTime(thread.lastMessageDate)}</span>
          </div>
          {/* Quick actions (shown on hover) */}
          <div className="hidden group-hover:flex items-center gap-0.5">
            {thread.unread && (
              <button onClick={(e) => { e.stopPropagation(); markRead(thread.id); }} className="p-1 rounded hover:bg-bg-active cursor-pointer" title="Mark read">
                <IoCheckmark size={13} className="text-text-tertiary" />
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); toggleStar(thread.id); }} className="p-1 rounded hover:bg-bg-active cursor-pointer" title={thread.starred ? 'Unstar' : 'Star'}>
              {thread.starred ? <IoStar size={13} className="fill-yellow text-yellow" /> : <IoStarOutline size={13} className="text-text-tertiary" />}
            </button>
            <button onClick={(e) => { e.stopPropagation(); archiveThread(thread.id); }} className="p-1 rounded hover:bg-bg-active cursor-pointer" title="Archive">
              <IoArchiveOutline size={13} className="text-text-tertiary" />
            </button>
            <button className="p-1 rounded hover:bg-bg-active cursor-pointer" title="Snooze">
              <IoTimeOutline size={13} className="text-text-tertiary" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); trashThread(thread.id); }} className="p-1 rounded hover:bg-bg-active cursor-pointer" title="Trash">
              <IoTrashOutline size={13} className="text-text-tertiary" />
            </button>
          </div>
        </div>

        {/* Amount + Merchant (prominent for payments/rides/subscriptions) */}
        {meta.amount && (
          <div className="flex items-baseline gap-2.5 mb-3">
            <span className="text-2xl font-bold text-text-primary tracking-tight">{meta.amount}</span>
            {meta.merchant && <span className="text-sm text-text-secondary">{meta.merchant}</span>}
          </div>
        )}

        {/* Details grid */}
        {meta.details.length > 0 && (
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 mb-3">
            {meta.details.map(d => (
              <div key={d.label} className="flex items-baseline gap-2 min-w-0">
                <span className="text-xxs text-text-tertiary shrink-0">{d.label}</span>
                <span className="text-xs text-text-primary font-medium truncate">{d.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Items list */}
        {meta.items && meta.items.length > 0 && (
          <div className="mb-3 pl-3 border-l-2 border-border-primary space-y-1">
            {meta.items.map((item, i) => (
              <div key={i} className="text-xs text-text-secondary">{item}</div>
            ))}
          </div>
        )}

        {/* CTA */}
        {meta.ctaLabel && (
          <div className="mt-1">
            <button className="text-xxs text-accent hover:underline flex items-center gap-1 cursor-pointer">
              {meta.ctaLabel} <IoOpenOutline size={10} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

// ── Main Feed ──

type FilterType = 'all' | 'payment' | 'shipping' | 'delivery' | 'security' | 'ride' | 'subscription';

const filterOptions: { id: FilterType; label: string; icon: React.ElementType }[] = [
  { id: 'all', label: 'All', icon: IoCardOutline },
  { id: 'payment', label: 'Payments', icon: IoCardOutline },
  { id: 'shipping', label: 'Shipping', icon: IoCubeOutline },
  { id: 'delivery', label: 'Delivered', icon: IoLocationOutline },
  { id: 'ride', label: 'Rides', icon: IoCarOutline },
  { id: 'subscription', label: 'Subscriptions', icon: IoRefreshOutline },
  { id: 'security', label: 'Security', icon: IoShieldOutline },
];

export default function ReceiptsFeed() {
  const threadList = useAtomValue(filteredThreadsAtom);
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');

  // Only show filter chips that have matching data
  const availableFilters = useMemo(() => {
    const types = new Set<string>();
    for (const t of threadList) {
      if (t.meta?.kind === 'transaction') types.add(t.meta.type);
    }
    return filterOptions.filter(f => f.id === 'all' || types.has(f.id));
  }, [threadList]);

  const filtered = useMemo(() => {
    if (typeFilter === 'all') return threadList;
    return threadList.filter(t => t.meta?.kind === 'transaction' && t.meta.type === typeFilter);
  }, [threadList, typeFilter]);

  // Compute totals for the summary bar
  const summary = useMemo(() => {
    let totalSpend = 0;
    let pendingCount = 0;
    for (const t of threadList) {
      if (t.meta?.kind === 'transaction') {
        if (t.meta.amount) {
          totalSpend += parseFloat(t.meta.amount.replace(/[^0-9.]/g, '')) || 0;
        }
        if (t.meta.status === 'shipped' || t.meta.status === 'action_required') {
          pendingCount++;
        }
      }
    }
    return { totalSpend, pendingCount, count: threadList.length };
  }, [threadList]);

  if (threadList.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-primary">
        <div className="text-sm text-text-tertiary">No receipts</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-bg-primary min-w-0">
      {/* Summary bar */}
      <div className="flex items-center gap-6 px-5 py-3 border-b border-border-secondary shrink-0">
        <div>
          <div className="text-xxs text-text-tertiary uppercase tracking-wider">This period</div>
          <div className="text-lg font-bold text-text-primary">${summary.totalSpend.toFixed(2)}</div>
        </div>
        <div className="w-px h-8 bg-border-primary" />
        <div>
          <div className="text-xxs text-text-tertiary uppercase tracking-wider">Transactions</div>
          <div className="text-lg font-bold text-text-primary">{summary.count}</div>
        </div>
        {summary.pendingCount > 0 && (
          <>
            <div className="w-px h-8 bg-border-primary" />
            <div>
              <div className="text-xxs text-text-tertiary uppercase tracking-wider">Pending</div>
              <div className="text-lg font-bold text-yellow">{summary.pendingCount}</div>
            </div>
          </>
        )}
      </div>

      {/* Type filter */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border-secondary overflow-x-auto shrink-0">
        {availableFilters.map(f => (
          <button
            key={f.id}
            onClick={() => setTypeFilter(typeFilter === f.id ? 'all' : f.id)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer
              ${typeFilter === f.id ? 'bg-accent/15 text-accent' : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-3 space-y-2">
          {filtered.map(thread => (
            <ReceiptCard key={thread.id} thread={thread} />
          ))}
        </div>
      </div>
    </div>
  );
}
