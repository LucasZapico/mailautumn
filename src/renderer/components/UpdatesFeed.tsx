import { useState, useMemo, memo } from 'react';
import {
  IoStarOutline, IoStar, IoArchiveOutline, IoTrashOutline, IoCheckmark,
  IoOpenOutline, IoTimeOutline, IoGitPullRequestOutline, IoCheckmarkCircleOutline,
  IoAtOutline, IoChatbubbleOutline, IoNotificationsOutline, IoRocketOutline,
  IoWarningOutline, IoGridOutline, IoEllipsisHorizontal, IoSwapHorizontalOutline,
} from 'react-icons/io5';
import { useAtomValue, useSetAtom } from 'jotai';
import { filteredThreadsAtom, toggleStarAtom, markReadAtom, archiveThreadAtom, trashThreadAtom, selectThreadAtom, loadMessagesAtom, setThreadTypeAtom } from '../atoms/app';
import { themeModeAtom } from '../atoms/theme';
import type { Thread, ThreadMeta } from '../data/types';
import Avatar from './Avatar';
import { useContextMenu } from './ContextMenu';

/** Adapt a hex color's background opacity for dark vs light mode */
function colorBg(hex: string, isDark: boolean): string {
  return hex + (isDark ? '30' : '1a');
}

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

function senderDomain(thread: Thread): string {
  const email = thread.participants[0]?.email || '';
  return email.split('@')[1] || email;
}

/** Pick an icon based on the action string */
function actionIcon(action: string) {
  if (action.includes('review')) return IoGitPullRequestOutline;
  if (action.includes('accepted') || action.includes('approved')) return IoCheckmarkCircleOutline;
  if (action.includes('comment') || action.includes('moved')) return IoChatbubbleOutline;
  if (action.includes('mention')) return IoAtOutline;
  if (action.includes('deploy')) return IoRocketOutline;
  if (action.includes('issue') || action.includes('error')) return IoWarningOutline;
  if (action.includes('#') || action.includes('channel')) return IoGridOutline;
  return IoNotificationsOutline;
}

// ── Update Card ──

const UpdateCard = memo(function UpdateCard({ thread, isDark }: { thread: Thread; isDark: boolean }) {
  const selectThread = useSetAtom(selectThreadAtom);
  const loadMessages = useSetAtom(loadMessagesAtom);
  const toggleStar = useSetAtom(toggleStarAtom);
  const markRead = useSetAtom(markReadAtom);
  const archiveThread = useSetAtom(archiveThreadAtom);
  const trashThread = useSetAtom(trashThreadAtom);
  const setThreadType = useSetAtom(setThreadTypeAtom);
  const { show } = useContextMenu();
  const meta = thread.meta as Extract<ThreadMeta, { kind: 'notification' }> | undefined;
  const sender = thread.participants[0];

  const openThread = () => {
    selectThread(thread.id);
    loadMessages(thread.id);
    if (thread.unread) markRead(thread.id);
  };

  if (!meta || meta.kind !== 'notification') {
    return (
      <div onClick={openThread} className={`group flex gap-3 p-3 rounded-lg border border-border-secondary hover:border-border-primary/80 transition-colors cursor-pointer ${thread.unread ? 'bg-bg-secondary/50' : ''}`}>
        <Avatar contact={sender} size={28} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-semibold text-text-primary">{sender.name}</span>
            <span className="text-xxs text-text-tertiary">{formatTime(thread.lastMessageDate)}</span>
            {thread.unread && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
          </div>
          <p className="text-sm text-text-primary truncate">{thread.subject}</p>
          <p className="text-xs text-text-secondary truncate mt-0.5">{thread.snippet}</p>
        </div>
      </div>
    );
  }

  const Icon = actionIcon(meta.action);

  return (
    <div onClick={openThread} className={`group relative flex gap-3 p-3 rounded-lg border border-border-secondary hover:border-border-primary/80 transition-colors cursor-pointer ${thread.unread ? 'bg-bg-secondary/40' : ''}`}>
      {/* Service color bar */}
      <div className="w-1 rounded-full shrink-0 self-stretch" style={{ backgroundColor: meta.serviceColor }} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Service badge + time / quick actions */}
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className="text-xxs font-semibold px-1.5 py-0.5 rounded"
            style={{ color: meta.serviceColor, backgroundColor: colorBg(meta.serviceColor, isDark) }}
          >
            {meta.service}
          </span>
          {/* Time + indicators (hidden on hover) */}
          <span className="text-xxs text-text-tertiary group-hover:hidden">{formatTime(thread.lastMessageDate)}</span>
          {thread.unread && <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 group-hover:hidden" />}
          {thread.starred && <IoStar size={12} className="fill-yellow text-yellow group-hover:hidden" />}
          {/* Quick actions (shown on hover) */}
          <div className="hidden group-hover:flex items-center gap-0.5 ml-auto">
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
            <button onClick={(e) => {
              e.stopPropagation();
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              show(rect.right - 180, rect.bottom + 4, [
                { label: 'Move to Conversations', icon: <IoSwapHorizontalOutline size={14} />, onClick: () => setThreadType({ threadId: thread.id, type: 'conversation' }) },
                { label: 'Move to Newsletters', icon: <IoSwapHorizontalOutline size={14} />, onClick: () => setThreadType({ threadId: thread.id, type: 'newsletter' }) },
                { label: 'Move to Receipts', icon: <IoSwapHorizontalOutline size={14} />, onClick: () => setThreadType({ threadId: thread.id, type: 'transactional' }) },
                { label: 'Move to Promos', icon: <IoSwapHorizontalOutline size={14} />, onClick: () => setThreadType({ threadId: thread.id, type: 'marketing' }) },
              ]);
            }} className="p-1 rounded hover:bg-bg-active cursor-pointer" title="Move to...">
              <IoEllipsisHorizontal size={13} className="text-text-tertiary" />
            </button>
          </div>
        </div>

        {/* Action summary */}
        <div className="flex items-start gap-2">
          <Icon size={14} className="mt-0.5 shrink-0 text-text-tertiary" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-text-primary leading-snug">
              <strong>{meta.actor}</strong>
              <span className="text-text-secondary"> {meta.action}</span>
            </p>
            {meta.entity && (
              <p className="text-xs text-accent/80 mt-0.5 truncate">{meta.entity}</p>
            )}
          </div>
        </div>

        {/* Quote excerpt */}
        {meta.quote && (
          <div className="ml-6 mt-1.5 pl-2.5 border-l-2 border-border-primary text-xs text-text-secondary leading-relaxed line-clamp-2">
            {meta.quote}
          </div>
        )}

        {/* Stats + CTA */}
        <div className="ml-6 mt-2 flex items-center gap-3">
          {meta.stats && (
            <span className="text-xxs text-text-tertiary font-mono">{meta.stats}</span>
          )}
          {meta.ctaLabel && (
            <button className="text-xxs text-accent hover:underline flex items-center gap-1 cursor-pointer">
              {meta.ctaLabel} <IoOpenOutline size={10} />
            </button>
          )}
        </div>
      </div>

    </div>
  );
});

// ── Main Feed ──

export default function UpdatesFeed() {
  const threadList = useAtomValue(filteredThreadsAtom);
  const themeMode = useAtomValue(themeModeAtom);
  const isDark = themeMode !== 'light';
  const [serviceFilter, setServiceFilter] = useState<string | null>(null);

  // Build service filter chips
  const services = useMemo(() => {
    const map = new Map<string, { name: string; domain: string; color: string; count: number }>();
    for (const t of threadList) {
      const domain = senderDomain(t);
      const meta = t.meta;
      const existing = map.get(domain);
      if (existing) {
        existing.count++;
      } else {
        const color = meta?.kind === 'notification' ? meta.serviceColor : '#6b7280';
        map.set(domain, { name: t.participants[0]?.name || domain, domain, color, count: 1 });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [threadList]);

  const filtered = useMemo(() => {
    if (!serviceFilter) return threadList;
    return threadList.filter(t => senderDomain(t) === serviceFilter);
  }, [threadList, serviceFilter]);

  if (threadList.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-primary">
        <div className="text-sm text-text-tertiary">No updates</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-bg-primary min-w-0">
      {/* Service filter bar */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border-secondary overflow-x-auto shrink-0">
        <button
          onClick={() => setServiceFilter(null)}
          className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer
            ${serviceFilter === null ? 'bg-accent/15 text-accent' : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'}`}
        >
          All
        </button>
        {services.map(s => (
          <button
            key={s.domain}
            onClick={() => setServiceFilter(serviceFilter === s.domain ? null : s.domain)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer
              ${serviceFilter === s.domain ? 'bg-accent/15 text-accent' : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'}`}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            {s.name}
            <span className="text-2xs opacity-60">{s.count}</span>
          </button>
        ))}
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-3 space-y-2">
          {filtered.map(thread => (
            <UpdateCard key={thread.id} thread={thread} isDark={isDark} />
          ))}
        </div>
      </div>
    </div>
  );
}
