import { useState, useRef, useCallback, useMemo, useEffect, memo } from 'react';
import {
  IoStar,
  IoStarOutline,
  IoArchiveOutline,
  IoTrashOutline,
  IoCheckmark,
  IoChevronDownOutline,
  IoNotificationsOffOutline,
  IoEyeOutline,
  IoEyeOffOutline,
  IoTimeOutline,
} from 'react-icons/io5';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  filteredThreadsAtom,
  newsletterViewAtom,
  toggleStarAtom,
  markReadAtom,
  loadMessagesAtom,
  archiveThreadAtom,
  trashThreadAtom,
  selectThreadAtom,
} from '../atoms/app';
import type { Thread } from '../data/types';
import { themeModeAtom } from '../atoms/theme';
import Avatar from './Avatar';
import EmailFrame from './EmailFrame';

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

/** Strip <img> tags and inline style background-images for focused mode */
function stripImages(html: string): string {
  return html
    .replace(/<img[^>]*>/gi, '')
    .replace(/background-image\s*:\s*url\([^)]*\)\s*;?/gi, '');
}

// -- Newsletter Card --

const NewsletterCard = memo(function NewsletterCard({
  thread,
  focused,
  dark,
  isLast,
  onSkip,
}: {
  thread: Thread;
  focused: boolean;
  dark: boolean;
  isLast: boolean;
  onSkip: () => void;
}) {
  const selectThread = useSetAtom(selectThreadAtom);
  const toggleStar = useSetAtom(toggleStarAtom);
  const markRead = useSetAtom(markReadAtom);
  const archiveThread = useSetAtom(archiveThreadAtom);
  const trashThread = useSetAtom(trashThreadAtom);
  const message = thread.messages[thread.messages.length - 1];
  const sender = message?.from || thread.participants[0];
  const isLoading = !message?.body;
  const rawBody = message?.body || '';
  const bodyHTML = focused ? stripImages(rawBody) : rawBody;

  return (
    <article className={`group ${thread.unread ? '' : 'opacity-90'}`}>
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-3 sticky top-0 z-10 bg-bg-primary py-2">
        <Avatar contact={sender} size={28} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`text-xs text-text-primary truncate ${thread.unread ? 'font-semibold' : 'font-medium'}`}>
              {sender.name}
            </span>
            {sender.email && (
              <span className="text-2xs text-text-tertiary truncate hidden sm:inline">{sender.email}</span>
            )}
          </div>
          {message?.to?.length > 0 && (
            <span className="text-2xs text-text-tertiary truncate block">
              to {message.to.map(c => c.name || c.email).join(', ')}
            </span>
          )}
        </div>
        {/* Time + indicators (hidden on hover) */}
        <span className="text-xxs text-text-tertiary group-hover:hidden ml-auto shrink-0">{formatTime(thread.lastMessageDate)}</span>
        {thread.unread && <span className="w-1.5 h-1.5 rounded-full bg-accent group-hover:hidden shrink-0" />}
        {thread.starred && <IoStar size={12} className="fill-yellow text-yellow group-hover:hidden shrink-0" />}

        {/* Quick actions (shown on hover) */}
        <div className="hidden group-hover:flex items-center gap-0.5 ml-auto shrink-0">
          {thread.unread && (
            <button onClick={() => markRead(thread.id)} className="p-1 rounded hover:bg-bg-active cursor-pointer" title="Mark read">
              <IoCheckmark size={13} className="text-text-tertiary" />
            </button>
          )}
          <button onClick={() => toggleStar(thread.id)} className="p-1 rounded hover:bg-bg-active cursor-pointer" title={thread.starred ? 'Unstar' : 'Star'}>
            {thread.starred
              ? <IoStar size={13} className="fill-yellow text-yellow" />
              : <IoStarOutline size={13} className="text-text-tertiary" />
            }
          </button>
          <button onClick={() => archiveThread(thread.id)} className="p-1 rounded hover:bg-bg-active cursor-pointer" title="Archive">
            <IoArchiveOutline size={13} className="text-text-tertiary" />
          </button>
          <button className="p-1 rounded hover:bg-bg-active cursor-pointer" title="Snooze">
            <IoTimeOutline size={13} className="text-text-tertiary" />
          </button>
          <button onClick={() => trashThread(thread.id)} className="p-1 rounded hover:bg-bg-active cursor-pointer" title="Trash">
            <IoTrashOutline size={13} className="text-text-tertiary" />
          </button>
          <button className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-bg-active cursor-pointer" title="Unsubscribe">
            <IoNotificationsOffOutline size={12} className="text-text-tertiary" />
            <span className="text-xxs text-text-tertiary">Unsub</span>
          </button>
          {!isLast && (
            <>
              <div className="w-px h-4 bg-border-primary mx-0.5" />
              <button
                onClick={onSkip}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-bg-active text-xxs text-text-tertiary cursor-pointer"
              >
                Skip <IoChevronDownOutline size={12} />
              </button>
            </>
          )}
        </div>

        {/* Skip button (always visible when not hovering, only when not last) */}
        {!isLast && (
          <div className="ml-auto group-hover:hidden">
            <button
              onClick={onSkip}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-border-primary text-xxs text-text-tertiary hover:text-text-primary hover:border-border-primary/80 transition-colors cursor-pointer"
            >
              Skip <IoChevronDownOutline size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Subject — click to open thread */}
      <h3
        onClick={() => { selectThread(thread.id); if (thread.unread) markRead(thread.id); }}
        className={`text-sm mb-3 text-text-primary leading-snug cursor-pointer hover:text-accent transition-colors ${thread.unread ? 'font-bold' : 'font-semibold'}`}
      >
        {thread.subject}
      </h3>

      {/* Email body */}
      {isLoading ? (
        <div className="rounded-lg border border-border-secondary p-5 space-y-3 animate-pulse">
          <div className="h-4 w-3/4 rounded bg-bg-tertiary" />
          <div className="h-4 w-full rounded bg-bg-tertiary" />
          <div className="h-4 w-5/6 rounded bg-bg-tertiary" />
          <div className="h-32 w-full rounded bg-bg-tertiary mt-4" />
          <div className="h-4 w-2/3 rounded bg-bg-tertiary" />
          <div className="h-4 w-1/2 rounded bg-bg-tertiary" />
        </div>
      ) : (
        <div className={`rounded-lg border border-border-secondary overflow-hidden
            ${focused ? 'border-border-secondary/50' : ''}`}>
          <EmailFrame html={bodyHTML} dark={dark} />
        </div>
      )}
    </article>
  );
});

// -- Main Feed --

export default function NewsletterFeed() {
  const threadList = useAtomValue(filteredThreadsAtom);
  const newsletterView = useAtomValue(newsletterViewAtom);
  const setNewsletterView = useSetAtom(newsletterViewAtom);
  const loadMessages = useSetAtom(loadMessagesAtom);
  const [senderFilter, setSenderFilter] = useState<string | null>(null);
  const themeMode = useAtomValue(themeModeAtom);
  const containerRef = useRef<HTMLDivElement>(null);
  const isFocused = newsletterView === 'focused';
  const isDark = themeMode !== 'light';

  // Load message bodies for newsletter threads (they aren't selected individually)
  // Track in-flight requests to avoid duplicate calls while keeping retry possible
  const pendingRef = useRef(new Set<string>());
  useEffect(() => {
    for (const t of threadList) {
      if (t.messages.length === 0 && !pendingRef.current.has(t.id)) {
        pendingRef.current.add(t.id);
        loadMessages(t.id).finally(() => pendingRef.current.delete(t.id));
      }
    }
  }, [threadList, loadMessages]);

  const senders = useMemo(() => {
    const map = new Map<string, { name: string; domain: string; count: number }>();
    for (const t of threadList) {
      const domain = senderDomain(t);
      const existing = map.get(domain);
      if (existing) {
        existing.count++;
      } else {
        map.set(domain, { name: t.participants[0]?.name || domain, domain, count: 1 });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 12);
  }, [threadList]);

  const filtered = useMemo(() => {
    if (!senderFilter) return threadList;
    return threadList.filter(t => senderDomain(t) === senderFilter);
  }, [threadList, senderFilter]);

  const scrollToNext = useCallback((index: number) => {
    const el = containerRef.current;
    if (!el) return;
    const cards = el.querySelectorAll('article');
    const next = cards[index + 1];
    if (next) next.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  if (threadList.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-primary">
        <div className="text-sm text-text-tertiary">No newsletters</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-bg-primary min-w-0">
      {/* Top bar: sender filters + view toggle */}
      <div className="flex items-center border-b border-border-secondary shrink-0">
        <div className="flex items-center gap-1.5 px-4 py-2 overflow-x-auto flex-1">
          <button
            onClick={() => setSenderFilter(null)}
            className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer
              ${senderFilter === null ? 'bg-accent/15 text-accent' : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'}`}
          >
            All
          </button>
          {senders.length > 1 && senders.map(s => (
            <button
              key={s.domain}
              onClick={() => setSenderFilter(senderFilter === s.domain ? null : s.domain)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer
                ${senderFilter === s.domain ? 'bg-accent/15 text-accent' : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'}`}
            >
              {s.name}
              <span className="text-2xs opacity-60">{s.count}</span>
            </button>
          ))}
        </div>
        {/* View mode toggle */}
        <div className="flex items-center gap-0.5 px-3 shrink-0">
          <button
            onClick={() => setNewsletterView('full')}
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${!isFocused ? 'text-accent bg-accent/10' : 'text-text-tertiary hover:text-text-primary hover:bg-bg-hover'}`}
            title="Full view — render as intended"
          >
            <IoEyeOutline size={14} />
          </button>
          <button
            onClick={() => setNewsletterView('focused')}
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${isFocused ? 'text-accent bg-accent/10' : 'text-text-tertiary hover:text-text-primary hover:bg-bg-hover'}`}
            title="Focused view — text only, no images"
          >
            <IoEyeOffOutline size={14} />
          </button>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 overflow-y-auto">
        <div className={`mx-auto px-5 py-4 space-y-8 ${isFocused ? 'max-w-xl' : 'max-w-2xl'}`}>
          {filtered.map((thread, i) => (
            <NewsletterCard
              key={thread.id}
              thread={thread}
              focused={isFocused}
              dark={isDark}
              isLast={i === filtered.length - 1}
              onSkip={() => scrollToNext(i)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
