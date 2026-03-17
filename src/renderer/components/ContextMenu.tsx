import { useEffect, useRef, useState, useCallback, createContext, useContext } from 'react';
import type { ReactNode } from 'react';

export interface MenuItem {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  separator?: false;
  disabled?: boolean;
}

export interface MenuSeparator {
  separator: true;
}

export type MenuEntry = MenuItem | MenuSeparator;

interface MenuState {
  x: number;
  y: number;
  items: MenuEntry[];
}

interface ContextMenuAPI {
  show: (x: number, y: number, items: MenuEntry[]) => void;
  hide: () => void;
}

const ContextMenuCtx = createContext<ContextMenuAPI>({ show: () => {}, hide: () => {} });

export function useContextMenu() {
  return useContext(ContextMenuCtx);
}

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const show = useCallback((x: number, y: number, items: MenuEntry[]) => {
    setMenu({ x, y, items });
  }, []);

  const hide = useCallback(() => setMenu(null), []);

  // Close on click outside or Escape
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) hide();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick, true);
    };
  }, [menu, hide]);

  // Adjust position to stay within viewport
  const style = menu ? (() => {
    const pad = 8;
    let { x, y } = menu;
    const menuW = 200, menuH = menu.items.length * 32 + 8;
    if (x + menuW > window.innerWidth - pad) x = window.innerWidth - menuW - pad;
    if (y + menuH > window.innerHeight - pad) y = window.innerHeight - menuH - pad;
    if (x < pad) x = pad;
    if (y < pad) y = pad;
    return { left: x, top: y };
  })() : undefined;

  return (
    <ContextMenuCtx.Provider value={{ show, hide }}>
      {children}
      {menu && (
        <div
          ref={ref}
          className="fixed z-50 min-w-44 py-1 bg-bg-secondary border border-border-secondary rounded-lg shadow-xl"
          style={style}
        >
          {menu.items.map((item, i) => {
            if (item.separator) {
              return <div key={i} className="h-px bg-border-secondary my-1" />;
            }
            return (
              <button
                key={i}
                onClick={() => { item.onClick(); hide(); }}
                disabled={item.disabled}
                className="flex items-center gap-2.5 w-full px-3 py-1.5 text-xs text-text-primary hover:bg-bg-hover disabled:opacity-40 disabled:cursor-default cursor-pointer text-left"
              >
                {item.icon && <span className="text-text-tertiary w-4 flex items-center justify-center">{item.icon}</span>}
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </ContextMenuCtx.Provider>
  );
}
