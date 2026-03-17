import { useAtomValue, useSetAtom } from 'jotai';
import {
  IoMailOutline, IoStarOutline, IoTimeOutline, IoSendOutline,
  IoDocumentTextOutline, IoArchiveOutline, IoAlertCircleOutline,
  IoTrashOutline, IoPricetagOutline, IoSyncOutline, IoWarningOutline,
} from 'react-icons/io5';
import {
  showLabelsAtom, showViewsAtom, activeSidebarViewAtom,
  setSidebarViewAtom, sidebarLabelsAtom, threadsAtom,
  activeAliasFilterAtom, syncStatusMapAtom, accountsAtom,
} from '../atoms/app';
import type { SyncStatus } from '../atoms/app';
import type { SidebarView } from '../atoms/app';

const iconMap: Record<string, React.ElementType> = {
  inbox: IoMailOutline,
  starred: IoStarOutline,
  snoozed: IoTimeOutline,
  sent: IoSendOutline,
  drafts: IoDocumentTextOutline,
  archive: IoArchiveOutline,
  spam: IoAlertCircleOutline,
  trash: IoTrashOutline,
};

interface SidebarItemProps {
  name: string;
  icon: React.ElementType;
  active: boolean;
  count?: number;
  indent?: boolean;
  onClick: () => void;
}

function SidebarItem({ name, icon: Icon, active, count, indent, onClick }: SidebarItemProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 py-1.5 mx-1 rounded-md text-sm transition-colors cursor-pointer ${
        indent ? 'pl-7 pr-3' : 'px-3'
      } ${
        active
          ? 'bg-accent/15 text-accent font-medium'
          : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
      }`}
    >
      <Icon size={indent ? 13 : 15} className="shrink-0" />
      <span className="flex-1 text-left truncate">{name}</span>
      {count != null && count > 0 && (
        <span className={`text-xxs tabular-nums ${active ? 'text-accent' : 'text-text-tertiary'}`}>
          {count}
        </span>
      )}
    </button>
  );
}

const favorites: { id: SidebarView; name: string }[] = [
  { id: 'inbox', name: 'Inbox' },
  { id: 'starred', name: 'Starred' },
  { id: 'snoozed', name: 'Snoozed' },
  { id: 'drafts', name: 'Drafts' },
];

const views: { id: SidebarView; name: string }[] = [
  { id: 'sent', name: 'Sent' },
  { id: 'spam', name: 'Spam' },
  { id: 'archive', name: 'Archive' },
  { id: 'trash', name: 'Trash' },
];

export default function Sidebar() {
  const showLabels = useAtomValue(showLabelsAtom);
  const showViews = useAtomValue(showViewsAtom);
  const activeView = useAtomValue(activeSidebarViewAtom);
  const aliasFilter = useAtomValue(activeAliasFilterAtom);
  const setView = useSetAtom(setSidebarViewAtom);
  const labels = useAtomValue(sidebarLabelsAtom);
  const threads = useAtomValue(threadsAtom);
  const syncStatusMap = useAtomValue(syncStatusMapAtom);
  const accounts = useAtomValue(accountsAtom);

  const activeSyncing = accounts.filter(a => {
    const s = syncStatusMap.get(a.id);
    return s && (s.status === 'starting' || s.status === 'connected' || s.status === 'syncing');
  });
  const syncErrors = accounts.filter(a => {
    const s = syncStatusMap.get(a.id);
    return s && s.status === 'error';
  });

  // Count unread for inbox view
  const inboxUnread = threads.filter(t => t.unread).length;
  // Count starred threads
  const starredCount = threads.filter(t => t.starred).length;

  return (
    <div className="flex flex-col w-52 bg-bg-secondary border-r border-border-secondary py-2 shrink-0 overflow-y-auto">
      {/* Favorites */}
      <div className="px-3 mb-1">
        <span className="text-2xs font-semibold text-text-tertiary uppercase tracking-wider">Favorites</span>
      </div>
      {favorites.map(item => (
        <SidebarItem
          key={item.id}
          name={item.name}
          icon={iconMap[item.id] || IoMailOutline}
          active={activeView === item.id && !aliasFilter}
          count={item.id === 'inbox' ? inboxUnread : item.id === 'starred' ? starredCount : undefined}
          onClick={() => setView(item.id)}
        />
      ))}

      {/* Views */}
      {showViews && (
        <>
          <div className="px-3 mt-4 mb-1">
            <span className="text-2xs font-semibold text-text-tertiary uppercase tracking-wider">Views</span>
          </div>
          {views.map(item => (
            <SidebarItem
              key={item.id}
              name={item.name}
              icon={iconMap[item.id] || IoMailOutline}
              active={activeView === item.id && !aliasFilter}
              onClick={() => setView(item.id)}
            />
          ))}
        </>
      )}

      {/* Labels */}
      {showLabels && labels.length > 0 && (
        <>
          <div className="px-3 mt-4 mb-1">
            <span className="text-2xs font-semibold text-text-tertiary uppercase tracking-wider">Labels</span>
          </div>
          {labels.map(label => (
            <SidebarItem
              key={label.id}
              name={label.name}
              icon={IoPricetagOutline}
              active={activeView === label.id && !aliasFilter}
              onClick={() => setView(label.id)}
            />
          ))}
        </>
      )}

      {/* Spacer to push sync status to bottom */}
      <div className="flex-1" />

      {/* Sync status */}
      {(activeSyncing.length > 0 || syncErrors.length > 0) && (
        <div className="px-3 py-2 border-t border-border-secondary">
          {activeSyncing.length > 0 && (
            <div className="flex items-center gap-1.5 text-xxs text-text-tertiary">
              <IoSyncOutline size={12} className="text-accent animate-spin shrink-0" />
              <span className="truncate">
                Syncing {activeSyncing.length === 1
                  ? activeSyncing[0].email.split('@')[0]
                  : `${activeSyncing.length} accounts`}...
              </span>
            </div>
          )}
          {syncErrors.length > 0 && (
            <div className="flex items-center gap-1.5 text-xxs text-red-400 mt-1">
              <IoWarningOutline size={12} className="shrink-0" />
              <span className="truncate">
                {syncErrors.length === 1
                  ? syncErrors[0].email.split('@')[0]
                  : `${syncErrors.length} accounts`} error
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
