import { useState, useEffect, useRef, useCallback } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { IoCloseOutline } from 'react-icons/io5';
import { pendingSendAtom, undoSendDelayAtom, composeOpenAtom } from '../atoms/app';

export default function UndoSendToast() {
  const [pending, setPending] = useAtom(pendingSendAtom);
  const setCompose = useSetAtom(composeOpenAtom);
  const delay = useAtomValue(undoSendDelayAtom);
  const [remaining, setRemaining] = useState(0);
  const [sendError, setSendError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (sendTimerRef.current) { clearTimeout(sendTimerRef.current); sendTimerRef.current = null; }
  }, []);

  const doSend = useCallback(async () => {
    if (!pending || !window.api) return;
    clearTimers();
    setSendError(null);
    try {
      const result = await window.api.queueTask(pending.accountId, {
        type: 'SendDraftTask',
        draft: pending.draft,
      });
      if (result && !result.sent) {
        setSendError(result.error || 'Failed to send message');
        return; // Don't clear pending — let user retry or undo
      }
    } catch (err: any) {
      setSendError(err?.message || 'Failed to send message');
      return;
    }
    setPending(null);
  }, [pending, setPending, clearTimers]);

  // Start countdown when pending changes
  useEffect(() => {
    if (!pending) { clearTimers(); return; }

    const delayMs = delay * 1000;
    const endAt = pending.queuedAt + delayMs;
    setRemaining(Math.max(0, Math.ceil((endAt - Date.now()) / 1000)));

    timerRef.current = setInterval(() => {
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0 && timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }, 100);

    sendTimerRef.current = setTimeout(() => {
      doSend();
    }, Math.max(0, endAt - Date.now()));

    return clearTimers;
  }, [pending?.queuedAt, delay, doSend, clearTimers]);

  const handleUndo = () => {
    if (!pending) return;
    clearTimers();
    // Restore compose state
    setCompose(pending.compose);
    setPending(null);
  };

  if (!pending) return null;

  const progress = delay > 0 ? remaining / delay : 0;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col rounded-lg bg-bg-secondary border border-border-secondary shadow-xl min-w-80">
      {sendError && (
        <div className="px-4 pt-2.5 pb-1 text-xs text-red-400">
          Send failed: {sendError}
        </div>
      )}
      <div className="flex items-center gap-3 pl-4 pr-2 py-2.5">
        {/* Progress bar */}
        {!sendError && (
          <div className="absolute bottom-0 left-0 h-0.5 rounded-b-lg bg-accent transition-all duration-100" style={{ width: `${progress * 100}%` }} />
        )}

        <div className="flex-1 min-w-0">
          <span className="text-sm text-text-primary">{sendError ? 'Failed to send' : 'Sending...'}</span>
          {!sendError && <span className="text-xs text-text-tertiary ml-2">{remaining}s</span>}
        </div>

        {sendError ? (
          <>
            <button
              onClick={() => doSend()}
              className="px-3 py-1 rounded-md text-xs font-medium text-accent hover:bg-accent/10 transition-colors cursor-pointer"
            >
              Retry
            </button>
            <button
              onClick={handleUndo}
              className="px-3 py-1 rounded-md text-xs text-text-tertiary hover:text-text-secondary hover:bg-bg-hover transition-colors cursor-pointer"
            >
              Edit
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleUndo}
              className="px-3 py-1 rounded-md text-xs font-medium text-accent hover:bg-accent/10 transition-colors cursor-pointer"
            >
              Undo
            </button>
            <button
              onClick={() => doSend()}
              className="px-3 py-1 rounded-md text-xs text-text-tertiary hover:text-text-secondary hover:bg-bg-hover transition-colors cursor-pointer"
            >
              Send now
            </button>
          </>
        )}

        <button
          onClick={() => { clearTimers(); setPending(null); setSendError(null); }}
          className="p-1 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-colors cursor-pointer"
        >
          <IoCloseOutline size={14} />
        </button>
      </div>
    </div>
  );
}
