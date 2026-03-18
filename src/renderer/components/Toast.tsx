/**
 * Subtle toast notification — slides in from bottom, auto-dismisses.
 * Driven by a Jotai atom so any component can trigger a toast.
 */

import { useEffect, useState } from 'react';
import { useAtom } from 'jotai';
import { atom } from 'jotai';

export interface ToastMessage {
  id: number;
  text: string;
  action?: { label: string; onClick: () => void };
}

let nextId = 0;

/** Push a toast from anywhere */
export const toastAtom = atom<ToastMessage[]>([]);

export function pushToast(text: string, action?: { label: string; onClick: () => void }): void {
  const id = ++nextId;
  // Use the atom's internal setter — we store a ref below
  toastPushRef?.({ id, text, action });
}

// Ref to the setter so pushToast works outside React
let toastPushRef: ((msg: ToastMessage) => void) | null = null;

export default function ToastContainer() {
  const [toasts, setToasts] = useAtom(toastAtom);
  const [visible, setVisible] = useState<Set<number>>(new Set());

  // Wire up the push ref
  useEffect(() => {
    toastPushRef = (msg) => {
      setToasts(prev => [...prev, msg]);
      // Animate in after a tick
      requestAnimationFrame(() => {
        setVisible(prev => new Set(prev).add(msg.id));
      });
      // Auto-dismiss after 3s
      setTimeout(() => dismiss(msg.id), 3000);
    };
    return () => { toastPushRef = null; };
  }, [setToasts]);

  const dismiss = (id: number) => {
    setVisible(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    // Remove from list after fade out
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 200);
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-center gap-3 px-4 py-2.5 rounded-lg bg-bg-secondary border border-border-secondary shadow-lg transition-all duration-200"
          style={{
            opacity: visible.has(toast.id) ? 1 : 0,
            transform: visible.has(toast.id) ? 'translateY(0)' : 'translateY(8px)',
          }}
        >
          <span className="text-xs text-text-primary">{toast.text}</span>
          {toast.action && (
            <button
              onClick={() => { toast.action!.onClick(); dismiss(toast.id); }}
              className="text-xs font-medium text-accent hover:text-accent/80 cursor-pointer"
            >
              {toast.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
