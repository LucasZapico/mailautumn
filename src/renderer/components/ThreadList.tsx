import { memo } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  IoStarOutline, IoStar, IoArchiveOutline, IoTimeOutline, IoTrashOutline,
  IoMailUnreadOutline, IoMailOutline, IoPinOutline, IoPin, IoSwapHorizontalOutline,
} from 'react-icons/io5';
import {
  selectedThreadIdAtom, selectThreadAtom, markReadAtom, toggleStarAtom,
  archiveThreadAtom, trashThreadAtom, markUnreadAtom, togglePinAtom, accountEmailsAtom,
  densityAtom, showAvatarsAtom, filteredThreadsAtom, densityConfigAtom, setThreadTypeAtom,
} from '../atoms/app';
import type { Thread, Contact } from '../data/types';
import { useContextMenu } from './ContextMenu';
import Avatar from './Avatar';
import TypeChip from './TypeChip';

function formatDate(date: Date): string {
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

/** Get the display sender — first participant that isn't the current user */
function getSender(participants: Contact[], myEmails: Set<string>): Contact {
  if (participants.length === 0) return { name: 'Unknown', email: '' };
  if (participants.length === 1) return participants[0];
  const other = participants.find(p => !myEmails.has(p.email.toLowerCase()));
  return other || participants[0];
}

const ThreadItem = memo(function ThreadItem({ thread, myEmails }: { thread: Thread; myEmails: Set<string> }) {
  const selectedThreadId = useAtomValue(selectedThreadIdAtom);
  const selectThread = useSetAtom(selectThreadAtom);
  const markRead = useSetAtom(markReadAtom);
  const toggleStar = useSetAtom(toggleStarAtom);
  const togglePin = useSetAtom(togglePinAtom);
  const archiveThread = useSetAtom(archiveThreadAtom);
  const trashThread = useSetAtom(trashThreadAtom);
  const markUnread = useSetAtom(markUnreadAtom);
  const setThreadType = useSetAtom(setThreadTypeAtom);
  const density = useAtomValue(densityAtom);
  const showAvatars = useAtomValue(showAvatarsAtom);
  const dc = useAtomValue(densityConfigAtom);
  const { show } = useContextMenu();
  const isSelected = selectedThreadId === thread.id;
  const sender = getSender(thread.participants, myEmails);
  const otherCount = thread.participants.filter(p => !myEmails.has(p.email.toLowerCase())).length;
  const isCompact = density === 'compact';

  const typeLabels: { type: string; label: string }[] = [
    { type: 'conversation', label: 'Conversation' },
    { type: 'newsletter', label: 'Newsletter' },
    { type: 'notification', label: 'Notification' },
    { type: 'transactional', label: 'Receipt' },
    { type: 'marketing', label: 'Marketing' },
    { type: 'calendar', label: 'Calendar' },
  ];

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    show(e.clientX, e.clientY, [
      {
        label: thread.pinned ? 'Unpin' : 'Pin to Top',
        icon: thread.pinned ? <IoPin size={14} className="text-accent" /> : <IoPinOutline size={14} />,
        onClick: () => togglePin(thread.id),
      },
      {
        label: thread.starred ? 'Unstar' : 'Star',
        icon: thread.starred ? <IoStar size={14} className="text-yellow" /> : <IoStarOutline size={14} />,
        onClick: () => toggleStar(thread.id),
      },
      {
        label: thread.unread ? 'Mark as Read' : 'Mark as Unread',
        icon: thread.unread ? <IoMailOutline size={14} /> : <IoMailUnreadOutline size={14} />,
        onClick: () => thread.unread ? markRead(thread.id) : markUnread(thread.id),
      },
      { separator: true },
      ...typeLabels
        .filter(t => t.type !== thread.type)
        .map(t => ({
          label: `Move to ${t.label}`,
          icon: <IoSwapHorizontalOutline size={14} />,
          onClick: () => setThreadType({ threadId: thread.id, type: t.type }),
        })),
      { separator: true },
      {
        label: 'Archive',
        icon: <IoArchiveOutline size={14} />,
        onClick: () => archiveThread(thread.id),
      },
      {
        label: 'Trash',
        icon: <IoTrashOutline size={14} />,
        onClick: () => trashThread(thread.id),
      },
    ]);
  };

  return (
    <div
      onClick={() => { selectThread(thread.id); markRead(thread.id); }}
      onContextMenu={handleContextMenu}
      className={`group flex items-start ${dc.threadGap} px-3 ${dc.threadPy} cursor-pointer border-b
        ${thread.pinned ? 'border-l-2 border-l-accent border-b-border-secondary bg-accent/[0.03]' : 'border-b-border-secondary'}
        ${isSelected ? 'bg-bg-active' : 'hover:bg-bg-hover'}
        ${thread.unread ? '' : 'opacity-80'}`}
    >
      {showAvatars && <Avatar contact={sender} size={dc.avatarSize} className="mt-0.5 shrink-0" />}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`${dc.fontSize} truncate ${thread.unread ? 'font-semibold text-text-primary' : 'text-text-secondary'}`}>
            {sender.name || sender.email}
            {otherCount > 1 && (
              <span className="text-text-tertiary ml-1 text-xs">+{otherCount - 1}</span>
            )}
          </span>
          {!isCompact && <TypeChip type={thread.type} />}
          <span className="ml-auto text-xxs text-text-tertiary tabular-nums shrink-0">
            {formatDate(thread.lastMessageDate)}
          </span>
        </div>
        <div className={`text-xs truncate ${isCompact ? '' : 'mb-0.5'} ${thread.unread ? 'text-text-primary' : 'text-text-secondary'}`}>
          {thread.subject}
          {isCompact && <TypeChip type={thread.type} />}
        </div>
        {!isCompact && (
          <div className={`text-xs text-text-tertiary ${dc.snippetLines > 1 ? 'line-clamp-2' : 'truncate'}`}>
            {thread.snippet}
          </div>
        )}
      </div>

      {/* Quick actions on hover */}
      <div className="hidden group-hover:flex items-center gap-0.5 shrink-0 mt-0.5">
        <button onClick={e => { e.stopPropagation(); togglePin(thread.id); }} className="p-1 rounded hover:bg-bg-active cursor-pointer" title={thread.pinned ? 'Unpin' : 'Pin'}>
          {thread.pinned
            ? <IoPin size={isCompact ? 12 : 14} className="text-accent" />
            : <IoPinOutline size={isCompact ? 12 : 14} className="text-text-tertiary" />
          }
        </button>
        <button onClick={e => { e.stopPropagation(); toggleStar(thread.id); }} className="p-1 rounded hover:bg-bg-active cursor-pointer">
          {thread.starred
            ? <IoStar size={isCompact ? 12 : 14} className="text-yellow" />
            : <IoStarOutline size={isCompact ? 12 : 14} className="text-text-tertiary" />
          }
        </button>
        <button onClick={e => { e.stopPropagation(); archiveThread(thread.id); }} className="p-1 rounded hover:bg-bg-active cursor-pointer" title="Archive">
          <IoArchiveOutline size={isCompact ? 12 : 14} className="text-text-tertiary" />
        </button>
        <button className="p-1 rounded hover:bg-bg-active cursor-pointer" title="Snooze">
          <IoTimeOutline size={isCompact ? 12 : 14} className="text-text-tertiary" />
        </button>
        <button onClick={e => { e.stopPropagation(); trashThread(thread.id); }} className="p-1 rounded hover:bg-bg-active cursor-pointer" title="Trash">
          <IoTrashOutline size={isCompact ? 12 : 14} className="text-text-tertiary" />
        </button>
      </div>

      {/* Indicators (not hovering) */}
      <div className="flex flex-col items-center gap-1 shrink-0 mt-1 group-hover:hidden">
        {thread.pinned && <IoPin size={12} className="text-accent" />}
        {thread.starred && <IoStar size={12} className="text-yellow" />}
        {thread.unread && <div className="w-2 h-2 rounded-full bg-accent" />}
      </div>
    </div>
  );
});

export default function ThreadList({ fullWidth = false }: { fullWidth?: boolean }) {
  const threadList = useAtomValue(filteredThreadsAtom);
  const myEmails = useAtomValue(accountEmailsAtom);

  return (
    <div className={`flex flex-col bg-bg-secondary border-r border-border-secondary ${fullWidth ? 'flex-1' : 'w-80 shrink-0'}`}>
      <div className="flex-1 overflow-y-auto">
        {threadList.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-text-tertiary">
            No emails in this view
          </div>
        ) : (
          threadList.map((thread, i) => (
            <div key={thread.id}>
              {/* Divider between pinned and unpinned sections */}
              {i > 0 && threadList[i - 1].pinned && !thread.pinned && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-tertiary/50">
                  <IoPinOutline size={10} className="text-text-tertiary" />
                  <span className="text-2xs font-medium uppercase tracking-wider text-text-tertiary">Pinned above</span>
                  <div className="flex-1 h-px bg-border-secondary" />
                </div>
              )}
              <ThreadItem thread={thread} myEmails={myEmails} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
