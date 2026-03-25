import { useMemo, useState, useEffect, useRef, useCallback, memo } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  IoArrowUndoOutline, IoArrowRedoOutline, IoStarOutline, IoStar,
  IoEllipsisHorizontal, IoArchiveOutline, IoTrashOutline, IoArrowBackOutline,
  IoChevronUpOutline, IoChevronDownOutline, IoMailUnreadOutline,
  IoChevronDown, IoPinOutline, IoPin, IoSparklesOutline,
  IoCalendarOutline, IoCheckmarkCircleOutline, IoChevronUp,
  IoSwapHorizontalOutline, IoDocumentOutline, IoImageOutline,
  IoDownloadOutline, IoCopyOutline, IoCreateOutline,
} from 'react-icons/io5';
import {
  selectedThreadIdAtom, selectedThreadAtom, selectThreadAtom,
  filteredThreadsAtom, viewModeAtom, goBackToListAtom, densityConfigAtom,
  toggleStarAtom, archiveThreadAtom, trashThreadAtom, markUnreadAtom, togglePinAtom,
  setThreadTypeAtom, setDomainTypeAtom, crmPanelExpandedAtom,
  composeOpenAtom, accountEmailsAtom,
} from '../atoms/app';
import type { Message, Thread } from '../data/types';
import { themeModeAtom } from '../atoms/theme';
import { extractForThread, type ExtractionResult } from '../lib/content-extractor';
import { useContextMenu } from './ContextMenu';
import Avatar from './Avatar';
import TypeChip from './TypeChip';
import ComposeBar from './ComposeBar';
import EmailFrame from './EmailFrame';
import PluginSlot from '../plugins/PluginSlot';

const bodyStyles = '[&_a]:text-blue [&_a]:underline [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1 [&_blockquote]:border-l-2 [&_blockquote]:border-border-primary [&_blockquote]:pl-3 [&_blockquote]:text-text-secondary [&_blockquote]:italic [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_pre]:bg-bg-tertiary [&_pre]:rounded-md [&_pre]:p-3 [&_pre]:my-2 [&_pre]:text-xs [&_pre]:overflow-x-auto [&_code]:text-xs [&_code]:font-mono [&_table]:my-2 [&_td]:py-1 [&_td]:pr-4';

function formatTime(date: Date): string {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (isToday) return time;
  return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${time}`;
}

function shouldGroupWithPrevious(messages: Message[], index: number): boolean {
  if (index === 0) return false;
  const prev = messages[index - 1];
  const curr = messages[index];
  if (prev.from.email !== curr.from.email) return false;
  return curr.date.getTime() - prev.date.getTime() < 300000;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentFileUrl(id: string, filename: string): string {
  const lower = id.toLowerCase();
  return `mailspring-file://local/files/${lower.slice(0, 2)}/${lower.slice(2, 4)}/${lower}/${encodeURIComponent(filename)}`;
}

function fileIcon(contentType: string) {
  if (contentType === 'application/pdf') return <IoDocumentOutline size={14} className="text-red-400 shrink-0" />;
  if (contentType.startsWith('image/')) return <IoImageOutline size={14} className="text-blue shrink-0" />;
  return <IoDocumentOutline size={14} className="text-text-tertiary shrink-0" />;
}

function AttachmentChip({ attachment }: { attachment: { id: string; filename: string; size: number; contentType: string } }) {
  const { show } = useContextMenu();

  const handleClick = () => {
    window.api?.openAttachment(attachment.id);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    show(e.clientX, e.clientY, [
      { label: 'Open', icon: <IoDocumentOutline size={14} />, onClick: handleClick },
      { label: 'Save As...', icon: <IoDownloadOutline size={14} />, onClick: () => window.api?.saveAttachment(attachment.id, attachment.filename) },
    ]);
  };

  return (
    <button
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border-secondary bg-bg-secondary hover:bg-bg-hover transition-colors cursor-pointer max-w-64"
    >
      {fileIcon(attachment.contentType)}
      <span className="text-xs text-text-primary truncate">{attachment.filename}</span>
      <span className="text-2xs text-text-tertiary shrink-0">{formatFileSize(attachment.size)}</span>
    </button>
  );
}

function AttachmentPreview({ attachment }: { attachment: { id: string; filename: string; size: number; contentType: string } }) {
  const [collapsed, setCollapsed] = useState(false);
  const { show } = useContextMenu();
  const fileUrl = attachmentFileUrl(attachment.id, attachment.filename);
  const isPdf = attachment.contentType === 'application/pdf';
  const isImage = attachment.contentType.startsWith('image/');

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    show(e.clientX, e.clientY, [
      { label: 'Open in App', icon: <IoDocumentOutline size={14} />, onClick: () => window.api?.openAttachment(attachment.id) },
      { label: 'Save As...', icon: <IoDownloadOutline size={14} />, onClick: () => window.api?.saveAttachment(attachment.id, attachment.filename) },
    ]);
  };

  if (!isPdf && !isImage) return <AttachmentChip attachment={attachment} />;

  return (
    <div className="rounded-lg border border-border-secondary overflow-hidden max-w-lg" onContextMenu={handleContextMenu}>
      {/* Header bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-secondary">
        {fileIcon(attachment.contentType)}
        <span className="text-xs text-text-primary truncate flex-1">{attachment.filename}</span>
        <span className="text-2xs text-text-tertiary shrink-0">{formatFileSize(attachment.size)}</span>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-0.5 rounded hover:bg-bg-hover cursor-pointer text-text-tertiary"
          title={collapsed ? 'Expand preview' : 'Collapse preview'}
        >
          {collapsed ? <IoChevronDown size={12} /> : <IoChevronUp size={12} />}
        </button>
        <button
          onClick={() => window.api?.saveAttachment(attachment.id, attachment.filename)}
          className="p-0.5 rounded hover:bg-bg-hover cursor-pointer text-text-tertiary"
          title="Save"
        >
          <IoDownloadOutline size={13} />
        </button>
      </div>
      {/* Preview */}
      {!collapsed && isPdf && (
        <iframe
          src={fileUrl}
          className="w-full border-0 bg-bg-tertiary"
          style={{ height: 400 }}
          title={attachment.filename}
        />
      )}
      {!collapsed && isImage && (
        <img
          src={fileUrl}
          alt={attachment.filename}
          className="max-w-full max-h-80 object-contain bg-bg-tertiary cursor-pointer"
          onClick={() => window.api?.openAttachment(attachment.id)}
        />
      )}
    </div>
  );
}

function AttachmentList({ attachments }: { attachments: { id: string; filename: string; size: number; contentType: string }[] }) {
  const previews = attachments.filter(a => a.contentType === 'application/pdf' || a.contentType.startsWith('image/'));
  const files = attachments.filter(a => a.contentType !== 'application/pdf' && !a.contentType.startsWith('image/'));

  return (
    <div className="mt-2 space-y-2">
      {previews.map(a => <AttachmentPreview key={a.id} attachment={a} />)}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map(a => <AttachmentChip key={a.id} attachment={a} />)}
        </div>
      )}
    </div>
  );
}

const MessageItem = memo(function MessageItem({ message, grouped, extraction, useIframe }: { message: Message; grouped: boolean; extraction?: ExtractionResult; useIframe?: boolean }) {
  const dc = useAtomValue(densityConfigAtom);
  const themeMode = useAtomValue(themeModeAtom);
  const toggleStar = useSetAtom(toggleStarAtom);
  const archiveThread = useSetAtom(archiveThreadAtom);
  const trashThread = useSetAtom(trashThreadAtom);
  const markUnread = useSetAtom(markUnreadAtom);
  const { show } = useContextMenu();
  const [expanded, setExpanded] = useState(false);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) return;

    show(e.clientX, e.clientY, [
      {
        label: 'Reply',
        icon: <IoArrowUndoOutline size={14} />,
        onClick: () => {},
        disabled: true,
      },
      {
        label: 'Forward',
        icon: <IoArrowRedoOutline size={14} />,
        onClick: () => {},
        disabled: true,
      },
      { separator: true },
      {
        label: message.starred ? 'Unstar' : 'Star',
        icon: message.starred ? <IoStar size={14} className="text-yellow" /> : <IoStarOutline size={14} />,
        onClick: () => toggleStar(message.threadId),
      },
      {
        label: 'Mark as Unread',
        icon: <IoMailUnreadOutline size={14} />,
        onClick: () => markUnread(message.threadId),
      },
      { separator: true },
      {
        label: 'Archive',
        icon: <IoArchiveOutline size={14} />,
        onClick: () => archiveThread(message.threadId),
      },
      {
        label: 'Trash',
        icon: <IoTrashOutline size={14} />,
        onClick: () => trashThread(message.threadId),
      },
    ]);
  };

  // Strip <style> and <script> tags to prevent CSS/JS leaking into the app DOM
  const sanitize = (html: string) => html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

  const extracted = extraction?.html ?? sanitize(message.body);
  const wasStripped = extraction?.stripped ?? false;
  const displayBody = expanded ? sanitize(message.body) : extracted;

  const attachments = message.attachments;

  const bodyEl = useIframe ? (
    <>
      <EmailFrame html={message.body} />
      {attachments && attachments.length > 0 && <AttachmentList attachments={attachments} />}
    </>
  ) : (
    <>
      <div className={`${dc.fontSize} text-text-primary leading-relaxed ${bodyStyles}`}
        dangerouslySetInnerHTML={{ __html: displayBody }}
      />
      {attachments && attachments.length > 0 && <AttachmentList attachments={attachments} />}
      {wasStripped && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 mt-1 text-xxs text-text-tertiary hover:text-text-secondary cursor-pointer"
        >
          {expanded ? <IoChevronUp size={12} /> : <IoChevronDown size={12} />}
          <span>{expanded ? 'Hide trimmed content' : 'Show trimmed content'}</span>
        </button>
      )}
    </>
  );

  return (
    <div className="group px-5 hover:bg-bg-hover/50" onContextMenu={handleContextMenu}>
      {grouped ? (
        <div className="pl-11 py-0.5">
          {bodyEl}
          <span className="hidden group-hover:inline text-2xs text-text-tertiary">
            {formatTime(message.date)}
          </span>
        </div>
      ) : (
        <div className={`flex ${dc.messageGap} ${dc.messagePy}`}>
          <Avatar contact={message.from} size={dc.avatarSize} className="mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`${dc.fontSize} font-semibold text-text-primary`}>{message.from.name || message.from.email}</span>
              {message.from.name && <span className="text-xxs text-text-tertiary">{message.from.email}</span>}
              <span className="text-xxs text-text-tertiary">{formatTime(message.date)}</span>
            </div>
            {bodyEl}
          </div>
          <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity">
            <button className="p-1.5 rounded-md hover:bg-bg-active cursor-pointer" title="Reply">
              <IoArrowUndoOutline size={14} className="text-text-tertiary" />
            </button>
            <button className="p-1.5 rounded-md hover:bg-bg-active cursor-pointer" title="Forward">
              <IoArrowRedoOutline size={14} className="text-text-tertiary" />
            </button>
            <button className="p-1.5 rounded-md hover:bg-bg-active cursor-pointer" title="More">
              <IoEllipsisHorizontal size={14} className="text-text-tertiary" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

function TypeChipDropdown({ thread }: { thread: Thread }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const setThreadType = useSetAtom(setThreadTypeAtom);

  const allTypes: { type: string; label: string; classes: string }[] = [
    { type: 'conversation', label: 'Conversation', classes: 'bg-bg-tertiary text-text-secondary' },
    { type: 'newsletter',   label: 'Newsletter',   classes: 'bg-blue/15 text-blue' },
    { type: 'notification', label: 'Update',        classes: 'bg-purple/15 text-purple' },
    { type: 'transactional',label: 'Receipt',       classes: 'bg-green/15 text-green' },
    { type: 'marketing',    label: 'Promo',         classes: 'bg-orange/15 text-orange' },
  ];

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onClickOutside, true);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', onClickOutside, true);
      window.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className="cursor-pointer"
        title="Change category"
      >
        {thread.type === 'conversation' || thread.type === 'human-one-off' ? (
          <span className="inline-flex px-1.5 py-0.5 rounded text-2xs font-medium bg-bg-tertiary text-text-tertiary hover:text-text-secondary shrink-0">
            Conversation
          </span>
        ) : (
          <TypeChip type={thread.type} />
        )}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-32 py-1 bg-bg-secondary border border-border-secondary rounded-lg shadow-xl">
          {allTypes.map(t => (
            <button
              key={t.type}
              onClick={() => { setThreadType({ threadId: thread.id, type: t.type }); setOpen(false); }}
              className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left cursor-pointer hover:bg-bg-hover ${t.type === thread.type ? 'opacity-50' : ''}`}
            >
              <span className={`inline-flex px-1.5 py-0.5 rounded text-2xs font-medium ${t.classes}`}>{t.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const moveToTypes: { type: string; label: string }[] = [
  { type: 'conversation', label: 'Conversation' },
  { type: 'newsletter', label: 'Newsletter' },
  { type: 'notification', label: 'Update' },
  { type: 'transactional', label: 'Receipt' },
  { type: 'marketing', label: 'Promo' },
];

function ParticipantPanel({ thread }: { thread: Thread }) {
  const myEmails = useAtomValue(accountEmailsAtom);
  const setCompose = useSetAtom(composeOpenAtom);
  const { show } = useContextMenu();

  const handleCopy = (email: string) => {
    navigator.clipboard.writeText(email).catch(err => console.error('[ParticipantPanel] copy failed', err));
  };

  const handleCompose = (contact: { name: string; email: string }) => {
    setCompose({
      mode: 'new',
      to: [{ name: contact.name, email: contact.email }],
      cc: [],
      bcc: [],
      subject: '',
      body: '',
      accountId: thread.accountId,
    });
  };

  const handleContextMenu = (e: React.MouseEvent, contact: { name: string; email: string }, isMe: boolean) => {
    e.preventDefault();
    const items: any[] = [
      { label: 'Copy Email', icon: <IoCopyOutline size={14} />, onClick: () => handleCopy(contact.email) },
    ];
    if (contact.name) {
      items.push({ label: 'Copy Name', icon: <IoCopyOutline size={14} />, onClick: () => navigator.clipboard.writeText(contact.name) });
    }
    if (!isMe) {
      items.push({ separator: true as const });
      items.push({ label: 'New Email', icon: <IoCreateOutline size={14} />, onClick: () => handleCompose(contact) });
    }
    show(e.clientX, e.clientY, items);
  };

  return (
    <div className="px-5 py-2 border-b border-border-secondary bg-bg-secondary/30 space-y-0.5">
      {thread.participants.map(p => {
        const isMe = myEmails.has(p.email.toLowerCase());
        return (
          <div
            key={p.email}
            className="flex items-center gap-2.5 py-1 px-2 -mx-2 rounded-lg hover:bg-bg-hover/50 group"
            onContextMenu={e => handleContextMenu(e, p, isMe)}
          >
            <Avatar contact={p} size={24} className="shrink-0" />
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <span className="text-xs font-medium text-text-primary truncate">
                {p.name || p.email}
                {isMe && <span className="ml-1.5 text-2xs font-normal text-text-tertiary">you</span>}
              </span>
              {p.name && (
                <span className="text-2xs text-text-tertiary truncate hidden sm:inline">{p.email}</span>
              )}
            </div>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => handleCopy(p.email)}
                className="p-1 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-active cursor-pointer"
                title="Copy email"
              >
                <IoCopyOutline size={13} />
              </button>
              {!isMe && (
                <button
                  onClick={() => handleCompose(p)}
                  className="p-1 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-active cursor-pointer"
                  title="New email"
                >
                  <IoCreateOutline size={13} />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ThreadHeader({ thread, position, total, onPrev, onNext }: {
  thread: Thread; position: number; total: number;
  onPrev: (() => void) | null; onNext: (() => void) | null;
}) {
  const viewMode = useAtomValue(viewModeAtom);
  const goBackToList = useSetAtom(goBackToListAtom);
  const toggleStar = useSetAtom(toggleStarAtom);
  const togglePin = useSetAtom(togglePinAtom);
  const archiveThread = useSetAtom(archiveThreadAtom);
  const trashThread = useSetAtom(trashThreadAtom);
  const markUnread = useSetAtom(markUnreadAtom);
  const setThreadType = useSetAtom(setThreadTypeAtom);
  const setDomainType = useSetAtom(setDomainTypeAtom);
  const { show } = useContextMenu();
  const [participantsOpen, setParticipantsOpen] = useState(false);

  const senderDomain = (thread.participants[0]?.email || '').split('@')[1] || '';

  const handleMore = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    show(rect.right - 200, rect.bottom + 4, [
      {
        label: thread.pinned ? 'Unpin' : 'Pin to Top',
        icon: thread.pinned ? <IoPin size={14} className="text-accent" /> : <IoPinOutline size={14} />,
        onClick: () => togglePin(thread.id),
      },
      {
        label: thread.unread ? 'Mark as Read' : 'Mark as Unread',
        icon: <IoMailUnreadOutline size={14} />,
        onClick: () => markUnread(thread.id),
      },
      { separator: true },
      ...moveToTypes
        .filter(t => t.type !== thread.type)
        .map(t => ({
          label: `Move to ${t.label}`,
          icon: <IoSwapHorizontalOutline size={14} />,
          onClick: () => setThreadType({ threadId: thread.id, type: t.type }),
        })),
      ...(senderDomain ? [
        { separator: true },
        ...moveToTypes
          .filter(t => t.type !== thread.type)
          .map(t => ({
            label: `Move all @${senderDomain} to ${t.label}`,
            icon: <IoSwapHorizontalOutline size={14} />,
            onClick: () => setDomainType({ domain: senderDomain, type: t.type }),
          })),
      ] : []),
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

  return (<>
    <div className="flex items-center gap-3 px-5 py-3 border-b border-border-secondary shrink-0">
      {viewMode === 'list' && (
        <button onClick={() => goBackToList()} className="p-1.5 -ml-1 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-hover cursor-pointer" title="Back to list">
          <IoArrowBackOutline size={16} />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {thread.pinned && <IoPin size={14} className="text-accent shrink-0" />}
          <h2 className="text-sm font-semibold text-text-primary truncate">{thread.subject}</h2>
          <TypeChipDropdown thread={thread} />
        </div>
        <button
          onClick={() => setParticipantsOpen(!participantsOpen)}
          className="flex items-center gap-1 max-w-full text-xs text-text-tertiary mt-0.5 hover:text-text-secondary cursor-pointer"
          title={participantsOpen ? 'Hide participants' : 'Show participants'}
        >
          <span className="truncate min-w-0">
            {thread.participants.map(p => p.name || p.email).join(', ')} &middot; {thread.messageCount} message{thread.messageCount !== 1 ? 's' : ''}
          </span>
          {participantsOpen ? <IoChevronUp size={11} className="shrink-0" /> : <IoChevronDown size={11} className="shrink-0" />}
        </button>
      </div>
      <div className="flex items-center gap-1">
        {/* Prev/Next */}
        <div className="flex items-center gap-0.5 mr-1">
          <span className="text-xxs text-text-tertiary tabular-nums mr-1">{position} / {total}</span>
          <button onClick={onPrev ?? undefined} disabled={!onPrev} title="Previous"
            className="p-1 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-hover disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors">
            <IoChevronUpOutline size={16} />
          </button>
          <button onClick={onNext ?? undefined} disabled={!onNext} title="Next"
            className="p-1 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-hover disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors">
            <IoChevronDownOutline size={16} />
          </button>
        </div>
        <div className="w-px h-5 bg-border-primary" />
        <button onClick={() => togglePin(thread.id)} className={`p-1.5 rounded-md hover:bg-bg-hover cursor-pointer ${thread.pinned ? 'text-accent' : 'text-text-tertiary hover:text-text-primary'}`} title={thread.pinned ? 'Unpin' : 'Pin'}>
          {thread.pinned ? <IoPin size={16} /> : <IoPinOutline size={16} />}
        </button>
        <button onClick={() => archiveThread(thread.id)} className="p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-hover cursor-pointer" title="Archive">
          <IoArchiveOutline size={16} />
        </button>
        <button onClick={() => trashThread(thread.id)} className="p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-hover cursor-pointer" title="Trash">
          <IoTrashOutline size={16} />
        </button>
        <button onClick={() => markUnread(thread.id)} className="p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-hover cursor-pointer" title="Mark unread">
          <IoMailUnreadOutline size={16} />
        </button>
        <button onClick={() => toggleStar(thread.id)} className="p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-hover cursor-pointer" title="Star">
          {thread.starred ? <IoStar size={16} className="text-yellow" /> : <IoStarOutline size={16} />}
        </button>
        <button onClick={handleMore} className="p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-hover cursor-pointer" title="More">
          <IoEllipsisHorizontal size={16} />
        </button>
      </div>
    </div>
    {participantsOpen && <ParticipantPanel thread={thread} />}
  </>
  );
}

interface ThreadAnalysis {
  summary: string;
  actionItems: string[];
  keyDates: { date: string; description: string }[];
  topics: string[];
  participants: { name: string; role: string }[];
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
}

function ThreadInsights({ thread }: { thread: Thread }) {
  const [analysis, setAnalysis] = useState<ThreadAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const requestedRef = useRef<string | null>(null);

  const fetchAnalysis = useCallback(async () => {
    if (!window.api?.analyzeThread || !thread.messages.length) return;
    const cacheKey = `${thread.id}:${thread.messages.length}`;
    if (requestedRef.current === cacheKey) return;
    requestedRef.current = cacheKey;

    // Check cache first
    if (window.api.getThreadAnalysis) {
      const cached = await window.api.getThreadAnalysis(thread.id, thread.messages.length);
      if (cached?.analysis) { setAnalysis(cached.analysis); return; }
    }

    setLoading(true);
    setError(null);
    try {
      const messages = thread.messages.map(m => ({
        from: `${m.from.name} <${m.from.email}>`,
        date: m.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        snippet: m.snippet || m.subject,
      }));
      const result = await window.api.analyzeThread(thread.id, messages, thread.messages.length);
      if (result?.analysis) {
        setAnalysis(result.analysis);
        setError(null);
      } else if (result?.error) {
        setError(result.error);
      }
    } catch (err: any) {
      setError(err?.message || 'AI analysis failed unexpectedly.');
    } finally {
      setLoading(false);
    }
  }, [thread.id, thread.messages]);

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  const retry = () => {
    requestedRef.current = null;
    setError(null);
    fetchAnalysis();
  };

  if (!analysis && !loading && !error) return null;

  const sentimentColors = {
    positive: 'text-green-400',
    neutral: 'text-text-tertiary',
    negative: 'text-red-400',
    mixed: 'text-yellow',
  };

  return (
    <div className="border-b border-border-secondary bg-bg-secondary/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-5 py-2 text-left cursor-pointer hover:bg-bg-hover/50 transition-colors"
      >
        <IoSparklesOutline size={14} className="text-accent shrink-0" />
        <span className="text-xs font-medium text-text-secondary flex-1">
          {loading ? 'Analyzing thread...' : error ? 'AI Insights — Error' : 'AI Insights'}
        </span>
        {analysis && (
          <div className="flex items-center gap-1.5">
            {analysis.topics.slice(0, 3).map(topic => (
              <span key={topic} className="px-1.5 py-0.5 rounded text-2xs bg-bg-tertiary text-text-tertiary">
                {topic}
              </span>
            ))}
          </div>
        )}
        {expanded ? <IoChevronUp size={12} className="text-text-tertiary" /> : <IoChevronDown size={12} className="text-text-tertiary" />}
      </button>

      {expanded && analysis && (
        <div className="px-5 pb-3 space-y-2">
          {/* Summary */}
          <p className="text-xs text-text-secondary leading-relaxed">{analysis.summary}</p>

          {/* Action Items */}
          {analysis.actionItems.length > 0 && (
            <div className="space-y-1">
              {analysis.actionItems.map((item, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-text-secondary">
                  <IoCheckmarkCircleOutline size={13} className="text-accent shrink-0 mt-0.5" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          )}

          {/* Key Dates */}
          {analysis.keyDates.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {analysis.keyDates.map((kd, i) => (
                <div key={i} className="flex items-center gap-1 text-xxs text-text-tertiary">
                  <IoCalendarOutline size={11} />
                  <span className="font-medium">{kd.date}</span>
                  {kd.description && <span>— {kd.description}</span>}
                </div>
              ))}
            </div>
          )}

          {/* Sentiment + Participants */}
          {analysis.participants.length > 0 && (
            <div className="flex items-center gap-3 text-xxs text-text-tertiary">
              <span className={sentimentColors[analysis.sentiment]}>
                {analysis.sentiment}
              </span>
              <span className="text-border-primary">|</span>
              {analysis.participants.map((p, i) => (
                <span key={i}>
                  {p.name}{p.role ? ` (${p.role})` : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="px-5 pb-3">
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            <div className="w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin" />
            <span>Analyzing conversation...</span>
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="px-5 pb-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/5 border border-red-500/15">
            <span className="text-xs text-red-400 flex-1">{error}</span>
            <button
              onClick={retry}
              className="text-xxs text-text-tertiary hover:text-text-secondary px-2 py-0.5 rounded hover:bg-bg-hover cursor-pointer shrink-0"
            >
              Retry
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MessageView() {
  const thread = useAtomValue(selectedThreadAtom);
  const selectThread = useSetAtom(selectThreadAtom);
  const threadList = useAtomValue(filteredThreadsAtom);
  const crmPanelExpanded = useAtomValue(crmPanelExpandedAtom);

  const currentIndex = thread ? threadList.findIndex(t => t.id === thread.id) : -1;
  const total = threadList.length;
  const position = currentIndex >= 0 ? currentIndex + 1 : 0;
  const onPrev = currentIndex > 0 ? () => selectThread(threadList[currentIndex - 1].id) : null;
  const onNext = currentIndex >= 0 && currentIndex < total - 1 ? () => selectThread(threadList[currentIndex + 1].id) : null;

  // Thread-aware content extraction with deduplication
  // Skip extraction for newsletters/marketing/notifications/transactional — render full body
  const isConversation = !thread || thread.type === 'conversation' || thread.type === 'human-one-off';
  const extractions = useMemo(() => {
    if (!thread?.messages.length || !isConversation) return new Map<string, ExtractionResult>();
    return extractForThread(thread.messages.map(m => ({ id: m.id, body: m.body })));
  }, [thread?.messages, isConversation]);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when thread changes — latest message should be visible
  const threadId = thread?.id;
  const messageCount = thread?.messages?.length ?? 0;
  useEffect(() => {
    if (!threadId) return;
    const scroll = () => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    };
    scroll();
    requestAnimationFrame(scroll);
    const t1 = setTimeout(scroll, 50);
    const t2 = setTimeout(scroll, 150);
    const t3 = setTimeout(scroll, 500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [threadId, messageCount]);

  if (!thread) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-primary">
        <div className="text-center text-text-tertiary">
          <div className="text-4xl mb-3">📬</div>
          <div className="text-sm">Select a conversation to read</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-w-0">
      <div className="flex-1 flex flex-col bg-bg-primary min-w-0">
        <ThreadHeader thread={thread} position={position} total={total} onPrev={onPrev} onNext={onNext} />
        {isConversation && thread.messages.length >= 2 && <ThreadInsights thread={thread} />}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {thread.messages.map((message, i) => (
            <MessageItem
              key={message.id}
              message={message}
              grouped={shouldGroupWithPrevious(thread.messages, i)}
              extraction={extractions.get(message.id)}
              useIframe={!isConversation}
            />
          ))}
          <div className="h-4" />
        </div>
        <ComposeBar thread={thread} onGrow={() => {
          if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }} />
      </div>
      {isConversation && <PluginSlot name="message-sidebar" expanded={crmPanelExpanded} />}
    </div>
  );
}
