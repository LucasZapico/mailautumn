import { useMemo } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  activeCategoryAtom, setActiveCategoryAtom, unreadCountAtom,
  activeAccountIdAtom, accountsAtom, activeAliasFilterAtom, setAliasFilterAtom,
} from '../atoms/app';
import type { CategoryTab } from '../data/types';

const tabs: { id: CategoryTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'conversation', label: 'Conversations' },
  { id: 'newsletter', label: 'Newsletters' },
  { id: 'notification', label: 'Updates' },
  { id: 'transactional', label: 'Receipts' },
  { id: 'marketing', label: 'Promos' },
];

export default function CategoryTabs() {
  const activeCategory = useAtomValue(activeCategoryAtom);
  const setActiveCategory = useSetAtom(setActiveCategoryAtom);
  const getUnreadCount = useAtomValue(unreadCountAtom);
  const activeAccountId = useAtomValue(activeAccountIdAtom);
  const accounts = useAtomValue(accountsAtom);
  const aliasFilter = useAtomValue(activeAliasFilterAtom);
  const setAlias = useSetAtom(setAliasFilterAtom);

  // Collect all addresses: primary emails + aliases from all accounts (when "All") or selected account
  const allAddresses = useMemo(() => {
    const targetAccounts = activeAccountId
      ? accounts.filter(a => a.id === activeAccountId)
      : accounts;
    const addrs: { email: string; label: string }[] = [];
    for (const acct of targetAccounts) {
      addrs.push({ email: acct.email, label: acct.email });
      for (const alias of acct.aliases || []) {
        addrs.push({ email: alias, label: alias });
      }
    }
    return addrs;
  }, [accounts, activeAccountId]);

  const showAliases = allAddresses.length > 1;

  return (
    <div className="shrink-0 bg-bg-primary border-b border-border-secondary">
      {/* Category tabs */}
      <div className="flex items-center gap-1 px-4 h-10">
        {tabs.map(tab => {
          const isActive = activeCategory === tab.id;
          const unread = getUnreadCount(tab.id);
          return (
            <button
              key={tab.id}
              onClick={() => setActiveCategory(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer
                ${isActive
                  ? 'bg-accent/15 text-accent'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                }`}
            >
              {tab.label}
              {unread > 0 && (
                <span className={`text-2xs tabular-nums ${isActive ? 'text-accent' : 'text-text-tertiary'}`}>
                  {unread}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Alias filter row */}
      {showAliases && (
        <div className="filter-scroll flex items-center gap-1 px-4 pb-2 overflow-x-auto">
          <button
            onClick={() => setAlias(null)}
            className={`px-2.5 py-1 rounded-full text-xxs font-medium whitespace-nowrap transition-colors cursor-pointer
              ${aliasFilter === null
                ? 'bg-accent/15 text-accent'
                : 'bg-bg-tertiary text-text-tertiary hover:text-text-secondary'
              }`}
          >
            All
          </button>
          {allAddresses.map(addr => (
            <button
              key={addr.email}
              onClick={() => setAlias(aliasFilter === addr.email ? null : addr.email)}
              className={`px-2.5 py-1 rounded-full text-xxs font-medium whitespace-nowrap transition-colors cursor-pointer
                ${aliasFilter === addr.email
                  ? 'bg-accent/15 text-accent'
                  : 'bg-bg-tertiary text-text-tertiary hover:text-text-secondary'
                }`}
            >
              {addr.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
