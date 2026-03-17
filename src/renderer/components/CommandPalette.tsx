import { useState, useEffect, useRef, useMemo } from 'react';
import {
  IoSearchOutline, IoMailOutline, IoStarOutline, IoSendOutline,
  IoArchiveOutline, IoTrashOutline, IoCreateOutline, IoSettingsOutline,
  IoMoonOutline, IoFlashOutline, IoChatbubbleOutline, IoNotificationsOutline,
} from 'react-icons/io5';
import { useAtom } from 'jotai';
import { commandPaletteOpenAtom, settingsOpenAtom } from '../atoms/app';

interface PaletteCommand {
  id: string;
  title: string;
  category: string;
  icon: React.ElementType;
  shortcut?: string;
  action?: () => void;
}

function fuzzyMatch(query: string, text: string): { matches: boolean; indices: number[] } {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const indices: number[] = [];
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      indices.push(ti);
      qi++;
    }
  }
  return { matches: qi === q.length, indices };
}

function HighlightedText({ text, indices }: { text: string; indices: number[] }) {
  const indexSet = new Set(indices);
  return (
    <span>
      {text.split('').map((char, i) =>
        indexSet.has(i) ? (
          <span key={i} className="text-accent font-semibold">{char}</span>
        ) : (
          <span key={i}>{char}</span>
        )
      )}
    </span>
  );
}

export default function CommandPalette() {
  const [open, setOpen] = useAtom(commandPaletteOpenAtom);
  const [, setSettingsOpen] = useAtom(settingsOpenAtom);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: PaletteCommand[] = useMemo(() => [
    { id: 'inbox', title: 'Go to Inbox', category: 'Navigate', icon: IoMailOutline, shortcut: 'G I' },
    { id: 'starred', title: 'Go to Starred', category: 'Navigate', icon: IoStarOutline, shortcut: 'G S' },
    { id: 'sent', title: 'Go to Sent', category: 'Navigate', icon: IoSendOutline, shortcut: 'G T' },
    { id: 'archive', title: 'Archive Thread', category: 'Action', icon: IoArchiveOutline, shortcut: 'E' },
    { id: 'trash', title: 'Move to Trash', category: 'Action', icon: IoTrashOutline, shortcut: '#' },
    { id: 'compose', title: 'Compose New Email', category: 'Compose', icon: IoCreateOutline, shortcut: 'C' },
    { id: 'focus', title: 'Toggle Focus Mode', category: 'View', icon: IoMoonOutline },
    { id: 'settings', title: 'Open Settings', category: 'App', icon: IoSettingsOutline, shortcut: '⌘,', action: () => setSettingsOpen(true) },
    { id: 'ai-summarize', title: 'Summarize Thread', category: 'AI', icon: IoFlashOutline },
    { id: 'ai-reply', title: 'Draft Reply with AI', category: 'AI', icon: IoChatbubbleOutline },
    { id: 'notifications', title: 'Show Notifications', category: 'View', icon: IoNotificationsOutline },
  ], [setSettingsOpen]);

  const results = useMemo(() => {
    if (!query.trim()) return commands.map(cmd => ({ cmd, indices: [] as number[] }));
    return commands
      .map(cmd => {
        const result = fuzzyMatch(query, cmd.title);
        return { cmd, indices: result.indices, matches: result.matches };
      })
      .filter(r => r.matches);
  }, [query, commands]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, setOpen]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  const executeCommand = (cmd: PaletteCommand) => {
    cmd.action?.();
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      executeCommand(results[selectedIndex].cmd);
    }
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
            placeholder="Type a command..."
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary outline-none"
          />
          <kbd className="px-1.5 py-0.5 bg-bg-tertiary rounded text-2xs text-text-tertiary">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto py-1">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-text-tertiary">No commands found</div>
          ) : (
            results.map(({ cmd, indices }, i) => {
              const Icon = cmd.icon;
              return (
                <div
                  key={cmd.id}
                  className={`flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors
                    ${i === selectedIndex ? 'bg-bg-hover' : ''}`}
                  onMouseEnter={() => setSelectedIndex(i)}
                  onClick={() => executeCommand(cmd)}
                >
                  <Icon size={15} className="text-text-tertiary shrink-0" />
                  <span className="flex-1 text-sm text-text-primary">
                    <HighlightedText text={cmd.title} indices={indices} />
                  </span>
                  <span className="text-2xs text-text-tertiary px-1.5 py-0.5 bg-bg-tertiary rounded">
                    {cmd.category}
                  </span>
                  {cmd.shortcut && (
                    <kbd className="text-2xs text-text-tertiary">{cmd.shortcut}</kbd>
                  )}
                </div>
              );
            })
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
