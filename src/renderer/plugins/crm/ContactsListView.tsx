/**
 * CRM Contacts List View — filterable table of all CRM contacts.
 * Shows tag filtering, last contacted date, and interaction count.
 * Private feature — not included in the open source repo.
 */

import { useState, useEffect, useMemo } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  IoSearchOutline, IoFunnelOutline, IoPersonOutline,
  IoTimeOutline, IoMailOutline, IoChevronDown,
  IoPricetagOutline, IoArrowForwardOutline,
} from 'react-icons/io5';
import {
  crmTagsAtom, loadTagsAtom, type CrmContact, type CrmTag,
} from './atoms';
import { selectThreadAtom } from '../../atoms/app';

function timeAgo(dateStr: string): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const days = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function staleness(dateStr: string): 'fresh' | 'warm' | 'stale' | 'cold' {
  if (!dateStr) return 'cold';
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 7) return 'fresh';
  if (days <= 30) return 'warm';
  if (days <= 90) return 'stale';
  return 'cold';
}

const stalenessColors = {
  fresh: 'text-green-400',
  warm: 'text-yellow-400',
  stale: 'text-orange-400',
  cold: 'text-red-400',
};

const stalenessLabels = {
  fresh: 'Recent',
  warm: '2-4 weeks',
  stale: '1-3 months',
  cold: '3+ months',
};

type SortField = 'name' | 'lastInteraction' | 'interactionCount' | 'tag' | 'followUp';
type SortDir = 'asc' | 'desc';

export default function ContactsListView() {
  const tags = useAtomValue(crmTagsAtom);
  const loadTags = useSetAtom(loadTagsAtom);
  const selectThread = useSetAtom(selectThreadAtom);

  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTag, setFilterTag] = useState<string>('');
  const [filterStaleness, setFilterStaleness] = useState<'' | 'fresh' | 'warm' | 'stale' | 'cold'>('');
  const [filterFollowUp, setFilterFollowUp] = useState<'' | 'overdue' | 'upcoming' | 'any'>('');
  const [sortField, setSortField] = useState<SortField>('lastInteraction');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [tagDropdown, setTagDropdown] = useState(false);

  // Load all contacts
  useEffect(() => {
    loadTags();
    loadContacts();
  }, []);

  const loadContacts = async () => {
    if (!window.api?.crmAllContacts) return;
    setLoading(true);
    const result = await window.api.crmAllContacts(500);
    setContacts(result || []);
    setLoading(false);
  };

  // Filter and sort
  const filtered = useMemo(() => {
    let list = contacts;

    if (filterTag) {
      list = list.filter(c => c.tag === filterTag);
    }

    if (filterStaleness) {
      list = list.filter(c => staleness(c.lastInteraction || '') === filterStaleness);
    }

    if (filterFollowUp) {
      const today = new Date().toISOString().slice(0, 10);
      if (filterFollowUp === 'overdue') {
        list = list.filter(c => c.followUp && c.followUp <= today);
      } else if (filterFollowUp === 'upcoming') {
        list = list.filter(c => c.followUp && c.followUp > today);
      } else if (filterFollowUp === 'any') {
        list = list.filter(c => !!c.followUp);
      }
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q)
      );
    }

    list = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = (a.name || a.email).localeCompare(b.name || b.email);
          break;
        case 'lastInteraction':
          cmp = (a.lastInteraction || '').localeCompare(b.lastInteraction || '');
          break;
        case 'interactionCount':
          cmp = (a.interactionCount || 0) - (b.interactionCount || 0);
          break;
        case 'tag':
          cmp = (a.tag || '').localeCompare(b.tag || '');
          break;
        case 'followUp':
          cmp = (a.followUp || '9999').localeCompare(b.followUp || '9999');
          break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return list;
  }, [contacts, filterTag, filterStaleness, filterFollowUp, search, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'name' || field === 'tag' ? 'asc' : 'desc');
    }
  };

  const headerBtn = (field: SortField, label: string) => (
    <button
      onClick={() => toggleSort(field)}
      className={`text-2xs font-medium uppercase tracking-wider cursor-pointer hover:text-text-primary transition-colors ${
        sortField === field ? 'text-accent' : 'text-text-tertiary'
      }`}
    >
      {label} {sortField === field && (sortDir === 'asc' ? '↑' : '↓')}
    </button>
  );

  // Stats
  const freshCount = contacts.filter(c => staleness(c.lastInteraction || '') === 'fresh').length;
  const staleCount = contacts.filter(c => staleness(c.lastInteraction || '') === 'stale' || staleness(c.lastInteraction || '') === 'cold').length;

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-bg-primary">
      {/* Header */}
      <div className="px-5 py-3 border-b border-border-secondary shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-text-primary">Contacts</h2>
          <div className="flex items-center gap-3 text-2xs text-text-tertiary">
            <span>{contacts.length} total</span>
            <span className="text-green-400">{freshCount} recent</span>
            {staleCount > 0 && <span className="text-red-400">{staleCount} need outreach</span>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-tertiary border border-border-primary">
            <IoSearchOutline size={14} className="text-text-tertiary shrink-0" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search contacts..."
              className="flex-1 bg-transparent text-xs text-text-primary outline-none placeholder:text-text-tertiary"
            />
          </div>

          {/* Tag filter */}
          <div className="relative">
            <button
              onClick={() => setTagDropdown(!tagDropdown)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                filterTag
                  ? 'border-accent/50 bg-accent/10 text-accent'
                  : 'border-border-primary bg-bg-tertiary text-text-secondary hover:text-text-primary'
              }`}
            >
              <IoFunnelOutline size={12} />
              {filterTag || 'All tags'}
              <IoChevronDown size={10} />
            </button>
            {tagDropdown && (
              <div className="absolute right-0 top-full mt-1 w-40 py-1 rounded-lg border border-border-secondary bg-bg-secondary shadow-xl z-50">
                <button
                  onClick={() => { setFilterTag(''); setTagDropdown(false); }}
                  className={`w-full px-3 py-1.5 text-xs text-left cursor-pointer hover:bg-bg-hover ${!filterTag ? 'text-accent' : 'text-text-secondary'}`}
                >
                  All tags
                </button>
                {tags.map(t => (
                  <button
                    key={t.tag}
                    onClick={() => { setFilterTag(t.tag); setTagDropdown(false); }}
                    className={`w-full px-3 py-1.5 text-xs text-left cursor-pointer hover:bg-bg-hover flex items-center justify-between ${
                      filterTag === t.tag ? 'text-accent' : 'text-text-secondary'
                    }`}
                  >
                    <span>{t.tag}</span>
                    <span className="text-2xs text-text-tertiary">{t.count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Staleness filter pills */}
        <div className="flex items-center gap-1.5 mt-2">
          <span className="text-2xs text-text-tertiary mr-1">Last contacted:</span>
          {([
            { id: '' as const, label: 'All' },
            { id: 'fresh' as const, label: 'This week' },
            { id: 'warm' as const, label: '2-4 weeks' },
            { id: 'stale' as const, label: '1-3 months' },
            { id: 'cold' as const, label: '3+ months' },
          ]).map(f => (
            <button
              key={f.id}
              onClick={() => setFilterStaleness(f.id)}
              className={`px-2 py-0.5 rounded-full text-2xs cursor-pointer transition-colors ${
                filterStaleness === f.id
                  ? f.id === 'cold' ? 'bg-red-500/15 text-red-400 font-medium'
                    : f.id === 'stale' ? 'bg-orange-500/15 text-orange-400 font-medium'
                    : f.id === 'warm' ? 'bg-yellow-500/15 text-yellow-400 font-medium'
                    : f.id === 'fresh' ? 'bg-green-500/15 text-green-400 font-medium'
                    : 'bg-accent/15 text-accent font-medium'
                  : 'text-text-tertiary hover:text-text-secondary hover:bg-bg-hover'
              }`}
            >
              {f.label}
              {f.id && (() => {
                const count = contacts.filter(c => staleness(c.lastInteraction || '') === f.id).length;
                return count > 0 ? ` (${count})` : '';
              })()}
            </button>
          ))}
        </div>
        {/* Follow-up filter pills */}
        <div className="flex items-center gap-1.5 mt-1.5">
          <span className="text-2xs text-text-tertiary mr-1">Follow-up:</span>
          {([
            { id: '' as const, label: 'All' },
            { id: 'overdue' as const, label: 'Overdue' },
            { id: 'upcoming' as const, label: 'Upcoming' },
            { id: 'any' as const, label: 'Has date' },
          ]).map(f => {
            const today = new Date().toISOString().slice(0, 10);
            const count = f.id === 'overdue' ? contacts.filter(c => c.followUp && c.followUp <= today).length
              : f.id === 'upcoming' ? contacts.filter(c => c.followUp && c.followUp > today).length
              : f.id === 'any' ? contacts.filter(c => !!c.followUp).length
              : 0;
            return (
              <button
                key={f.id}
                onClick={() => setFilterFollowUp(f.id)}
                className={`px-2 py-0.5 rounded-full text-2xs cursor-pointer transition-colors ${
                  filterFollowUp === f.id
                    ? f.id === 'overdue' ? 'bg-red-500/15 text-red-400 font-medium'
                      : f.id === 'upcoming' ? 'bg-blue-500/15 text-blue-400 font-medium'
                      : f.id === 'any' ? 'bg-purple-500/15 text-purple-400 font-medium'
                      : 'bg-accent/15 text-accent font-medium'
                    : 'text-text-tertiary hover:text-text-secondary hover:bg-bg-hover'
                }`}
              >
                {f.label}{f.id && count > 0 ? ` (${count})` : ''}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table header */}
      <div className="flex items-center gap-4 px-5 py-2 border-b border-border-secondary/50 shrink-0">
        <div className="w-52">{headerBtn('name', 'Name')}</div>
        <div className="w-20">{headerBtn('tag', 'Tag')}</div>
        <div className="w-24">{headerBtn('lastInteraction', 'Last Contact')}</div>
        <div className="w-24">{headerBtn('followUp', 'Follow Up')}</div>
        <div className="w-14">{headerBtn('interactionCount', 'Emails')}</div>
        <div className="flex-1 text-2xs font-medium text-text-tertiary uppercase tracking-wider">Company</div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-5 text-sm text-text-tertiary">Loading contacts...</div>
        ) : filtered.length === 0 ? (
          <div className="p-5 text-sm text-text-tertiary">
            {contacts.length === 0 ? 'No contacts in CRM yet. Add contacts from conversation threads.' : 'No contacts match your filters.'}
          </div>
        ) : (
          filtered.map(contact => {
            const stale = staleness(contact.lastInteraction || '');
            return (
              <div
                key={contact.email}
                className="flex items-center gap-4 px-5 py-2.5 border-b border-border-secondary/30 hover:bg-bg-hover/50 transition-colors group"
              >
                {/* Name + email */}
                <div className="w-52 min-w-0">
                  <div className="text-xs font-medium text-text-primary truncate">
                    {contact.name || contact.email.split('@')[0]}
                  </div>
                  <div className="text-2xs text-text-tertiary truncate">{contact.email}</div>
                </div>

                {/* Tag */}
                <div className="w-20">
                  {contact.tag ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-bg-tertiary text-2xs text-text-secondary">
                      <IoPricetagOutline size={9} />
                      {contact.tag}
                    </span>
                  ) : (
                    <span className="text-2xs text-text-tertiary">—</span>
                  )}
                </div>

                {/* Last contact */}
                <div className="w-24">
                  <span className={`text-xs ${stalenessColors[stale]}`}>
                    {timeAgo(contact.lastInteraction || '')}
                  </span>
                </div>

                {/* Follow up */}
                <div className="w-24">
                  {contact.followUp ? (
                    <span className={`text-xs ${new Date(contact.followUp) <= new Date() ? 'text-red-400 font-medium' : 'text-text-secondary'}`}>
                      {new Date(contact.followUp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  ) : (
                    <span className="text-2xs text-text-tertiary">—</span>
                  )}
                </div>

                {/* Count */}
                <div className="w-14 text-xs text-text-secondary">
                  {contact.interactionCount || 0}
                </div>

                {/* Company */}
                <div className="flex-1 min-w-0 text-xs text-text-secondary truncate">
                  {contact.company || '—'}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
