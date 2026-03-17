import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  IoSearchOutline, IoMailOutline, IoStarOutline, IoSendOutline,
  IoArchiveOutline, IoTrashOutline, IoCreateOutline, IoSettingsOutline,
  IoMoonOutline, IoFlashOutline, IoChatbubbleOutline, IoNotificationsOutline,
  IoPersonOutline, IoDocumentTextOutline, IoReturnDownBackOutline,
} from 'react-icons/io5';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import {
  commandPaletteOpenAtom, settingsOpenAtom, selectThreadAtom,
  setSidebarViewAtom, composeOpenAtom,
} from '../atoms/app';

// ── Types ──

interface PaletteCommand {
  id: string;
  title: string;
  category: string;
  icon: React.ElementType;
  shortcut?: string;
  action?: () => void;
}

interface SearchResult {
  type: 'thread' | 'contact';
  id: string;
  title: string;
  subtitle: string;
  snippet?: string;
}

type PaletteItem =
  | { kind: 'command'; data: PaletteCommand; indices: number[] }
  | { kind: 'search'; data: SearchResult };

// ── Fuzzy match ──

function fuzzyMatch(query: string, text: string): { matches: boolean; indices: number[] } {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const indices: number[] = [];
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) { indices.push(ti); qi++; }
  }
  return { matches: qi === q.length, indices };
}

function HighlightedText({ text, indices }: { text: string; indices: number[] }) {
  const indexSet = new Set(indices);
  return (
    <span>
      {text.split('').map((char, i) =>
        indexSet.has(i)
          ? <span key={i} className="text-accent font-semibold">{char}</span>
          : <span key={i}>{char}</span>
      )}
    </span>
  );
}

// ── Component ──

export default function CommandPalette() {
  const [open, setOpen] = useAtom(commandPaletteOpenAtom);
  const [, setSettingsOpen] = useAtom(settingsOpenAtom);
  const selectThread = useSetAtom(selectThreadAtom);
  const setSidebarView = useSetAtom(setSidebarViewAtom);
  const [, setCompose] = useAtom(composeOpenAtom);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  const commands: PaletteCommand[] = useMemo(() => [
    { id: 'inbox', title: 'Go to Inbox', category: 'Navigate', icon: IoMailOutline, shortcut: 'G I', action: () => setSidebarView('inbox') },
    { id: 'starred', title: 'Go to Starred', category: 'Navigate', icon: IoStarOutline, shortcut: 'G S', action: () => setSidebarView('starred') },
    { id: 'sent', title: 'Go to Sent', category: 'Navigate', icon: IoSendOutline, shortcut: 'G T', action: () => setSidebarView('sent') },
    { id: 'archive', title: 'Go to Archive', category: 'Navigate', icon: IoArchiveOutline, action: () => setSidebarView('archive') },
    { id: 'trash', title: 'Go to Trash', category: 'Navigate', icon: IoTrashOutline, action: () => setSidebarView('trash') },
    { id: 'compose', title: 'Compose New Email', category: 'Compose', icon: IoCreateOutline, shortcut: 'C', action: () => setCompose({ mode: 'new', to: [], cc: [], bcc: [], subject: '', body: '' }) },
    { id: 'settings', title: 'Open Settings', category: 'App', icon: IoSettingsOutline, shortcut: '⌘,', action: () => setSettingsOpen(true) },
    { id: 'ai-summarize', title: 'Summarize Thread', category: 'AI', icon: IoFlashOutline },
    { id: 'ai-reply', title: 'Draft Reply with AI', category: 'AI', icon: IoChatbubbleOutline },
  ], [setSettingsOpen, setSidebarView, setCompose]);

  // Debounced search
  const runSearch = useCallback((q: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim() || q.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      if (!window.api?.searchAll) { setSearching(false); return; }
      const results = await window.api.searchAll(q, 15);
      setSearchResults(results || []);
      setSearching(false);
    }, 150);
  }, []);

  // Build combined results
  const items: PaletteItem[] = useMemo(() => {
    const q = query.trim();
    const list: PaletteItem[] = [];

    // Commands (fuzzy match on title)
    if (q.length < 2 || q.length <= 3) {
      const cmdResults = q
        ? commands.map(cmd => ({ cmd, ...fuzzyMatch(q, cmd.title) })).filter(r => r.matches)
        : commands.map(cmd => ({ cmd, matches: true, indices: [] as number[] }));
      for (const r of cmdResults) {
        list.push({ kind: 'command', data: r.cmd, indices: r.indices });
      }
    }

    // Search results (from FTS5)
    for (const r of searchResults) {
      list.push({ kind: 'search', data: r });
    }

    return list;
  }, [query, commands, searchResults]);

  // Effects
  useEffect(() => { setSelectedIndex(0); }, [query, searchResults]);
  useEffect(() => { runSearch(query); }, [query, runSearch]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === 'Escape' && open) setOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, setOpen]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSearchResults([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  const execute = (item: PaletteItem) => {
    if (item.kind === 'command') {
      item.data.action?.();
    } else if (item.kind === 'search') {
      if (item.data.type === 'thread') {
        selectThread(item.data.id);
      }
      // Contact: could open compose to that contact, for now just close
    }
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && items[selectedIndex]) {
      execute(items[selectedIndex]);
    }
  };

  // Group items by section
  const commandItems = items.filter(i => i.kind === 'command');
  const threadItems = items.filter(i => i.kind === 'search' && i.data.type === 'thread');
  const contactItems = items.filter(i => i.kind === 'search' && i.data.type === 'contact');

  let globalIndex = -1;
  const renderItem = (item: PaletteItem) => {
    globalIndex++;
    const idx = globalIndex;
    const selected = idx === selectedIndex;

    if (item.kind === 'command') {
      const cmd = item.data;
      const Icon = cmd.icon;
      return (
        <div
          key={`cmd-${cmd.id}`}
          className={`flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors ${selected ? 'bg-bg-hover' : ''}`}
          onMouseEnter={() => setSelectedIndex(idx)}
          onClick={() => execute(item)}
        >
          <Icon size={15} className="text-text-tertiary shrink-0" />
          <span className="flex-1 text-sm text-text-primary">
            <HighlightedText text={cmd.title} indices={item.indices} />
          </span>
          {cmd.shortcut && <kbd className="text-2xs text-text-tertiary">{cmd.shortcut}</kbd>}
        </div>
      );
    }

    const r = item.data;
    const Icon = r.type === 'thread' ? IoDocumentTextOutline : IoPersonOutline;
    return (
      <div
        key={`${r.type}-${r.id}`}
        className={`flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors ${selected ? 'bg-bg-hover' : ''}`}
        onMouseEnter={() => setSelectedIndex(idx)}
        onClick={() => execute(item)}
      >
        <Icon size={15} className="text-text-tertiary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-text-primary truncate">{r.title}</div>
          <div className="text-2xs text-text-tertiary truncate">
            {r.subtitle}
            {r.snippet && <> — {r.snippet}</>}
          </div>
        </div>
        <IoReturnDownBackOutline size={12} className="text-text-tertiary shrink-0" />
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-bg-secondary border border-border-primary rounded-xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border-secondary">
          <IoSearchOutline size={16} className="text-text-tertiary shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search emails, contacts, or type a command..."
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary outline-none"
          />
          {searching && <div className="w-3 h-3 border-2 border-accent/50 border-t-accent rounded-full animate-spin" />}
          <kbd className="px-1.5 py-0.5 bg-bg-tertiary rounded text-2xs text-text-tertiary">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto py-1">
          {items.length === 0 && query.length >= 2 && !searching ? (
            <div className="px-4 py-8 text-center text-sm text-text-tertiary">No results found</div>
          ) : (
            <>
              {contactItems.length > 0 && (
                <>
                  <div className="px-4 pt-2 pb-1 text-2xs font-medium text-text-tertiary uppercase tracking-wider">Contacts</div>
                  {contactItems.map(renderItem)}
                </>
              )}
              {threadItems.length > 0 && (
                <>
                  <div className="px-4 pt-2 pb-1 text-2xs font-medium text-text-tertiary uppercase tracking-wider">Threads</div>
                  {threadItems.map(renderItem)}
                </>
              )}
              {commandItems.length > 0 && (
                <>
                  {(contactItems.length > 0 || threadItems.length > 0) && (
                    <div className="px-4 pt-2 pb-1 text-2xs font-medium text-text-tertiary uppercase tracking-wider">Commands</div>
                  )}
                  {commandItems.map(renderItem)}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-border-secondary text-2xs text-text-tertiary">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> select</span>
          <span><kbd className="font-mono">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
