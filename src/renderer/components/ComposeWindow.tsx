import { useState, useRef, useEffect, useMemo } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import {
  IoCloseOutline, IoSendOutline,
  IoChevronDown, IoArrowBackOutline, IoCheckmarkOutline,
  IoSparklesOutline,
} from 'react-icons/io5';
import { composeOpenAtom, accountsAtom, activeAccountIdAtom, undoSendDelayAtom, pendingSendAtom, threadsAtom, saveDraftAtom, destroyDraftAtom } from '../atoms/app';
import FormattingToolbar from './FormattingToolbar';
import type { ComposeState } from '../atoms/app';
import type { Account } from '../data/types';

function ContactChips({ label, value, onChange, autoFocus }: {
  label: string;
  value: { name: string; email: string }[];
  onChange: (contacts: { name: string; email: string }[]) => void;
  autoFocus?: boolean;
}) {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<{ name: string; email: string; refs: number }[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (input.length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      if (!window.api?.searchContacts) return;
      try {
        const results = await window.api.searchContacts(input, undefined, 8);
        const existing = new Set(value.map(c => c.email.toLowerCase()));
        const filtered = results.filter((r: any) => !existing.has(r.email.toLowerCase()));
        setSuggestions(filtered);
        setSelectedIdx(0);
        setShowSuggestions(filtered.length > 0);
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 150);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [input, value]);

  const addContact = (contact?: { name: string; email: string }) => {
    if (contact) {
      onChange([...value, contact]);
      setInput('');
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const trimmed = input.trim();
    if (!trimmed) return;
    const match = trimmed.match(/^(.+?)\s*<([^>]+)>$/);
    if (match) {
      onChange([...value, { name: match[1].trim(), email: match[2].trim() }]);
    } else if (trimmed.includes('@')) {
      onChange([...value, { name: '', email: trimmed }]);
    }
    setInput('');
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const remove = (i: number) => {
    onChange(value.filter((_, idx) => idx !== i));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx(i => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        addContact({ name: suggestions[selectedIdx].name, email: suggestions[selectedIdx].email });
        return;
      }
      if (e.key === 'Escape') {
        setShowSuggestions(false);
        return;
      }
    }

    if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',') {
      e.preventDefault();
      addContact();
    }
    if (e.key === 'Backspace' && !input && value.length > 0) {
      remove(value.length - 1);
    }
  };

  return (
    <div className="flex items-baseline gap-2 relative" ref={containerRef}>
      <span className="text-xxs text-text-tertiary shrink-0">{label}</span>
      <div className="flex flex-wrap items-center gap-1 flex-1 min-w-0">
        {value.map((c, i) => (
          <span key={i} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-bg-tertiary text-xs text-text-secondary">
            {c.name ? <>{c.name} <span className="text-text-tertiary">&lt;{c.email}&gt;</span></> : c.email}
            <button onClick={() => remove(i)} className="hover:text-text-primary cursor-pointer">
              <IoCloseOutline size={11} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            setTimeout(() => {
              addContact();
              setShowSuggestions(false);
            }, 150);
          }}
          onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
          placeholder={value.length === 0 ? 'Add recipients...' : ''}
          className="flex-1 min-w-24 bg-transparent text-xs text-text-primary outline-none placeholder:text-text-tertiary"
        />
      </div>

      {/* Autocomplete dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-6 mt-1 w-80 max-h-64 overflow-y-auto py-1 rounded-lg border border-border-secondary bg-bg-secondary shadow-xl z-50">
          {suggestions.map((s, i) => (
            <button
              key={s.email}
              onMouseDown={e => {
                e.preventDefault();
                addContact({ name: s.name, email: s.email });
              }}
              onMouseEnter={() => setSelectedIdx(i)}
              className={`flex items-center gap-2 w-full px-3 py-1.5 text-left cursor-pointer transition-colors ${
                i === selectedIdx ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:bg-bg-hover'
              }`}
            >
              <div className="w-6 h-6 rounded-full bg-bg-tertiary flex items-center justify-center text-2xs font-medium text-text-tertiary shrink-0">
                {(s.name || s.email).charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                {s.name && (
                  <div className="text-xs text-text-primary truncate">{s.name}</div>
                )}
                <div className={`text-xxs truncate ${s.name ? 'text-text-tertiary' : 'text-text-primary'}`}>{s.email}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FromSelector({ accounts, fromEmail, onChange }: {
  accounts: Account[];
  fromEmail: string;
  onChange: (email: string, accountId?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const options = useMemo(() => {
    const list: { email: string; accountName: string; accountId: string; isAlias: boolean }[] = [];
    for (const a of accounts) {
      list.push({ email: a.email, accountName: a.name, accountId: a.id, isAlias: false });
      for (const alias of a.aliases || []) {
        list.push({ email: alias, accountName: a.name, accountId: a.id, isAlias: true });
      }
    }
    return list;
  }, [accounts]);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  if (options.length <= 1) {
    return <span className="text-xxs text-text-tertiary">{fromEmail}</span>;
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-1.5 py-0.5 -ml-1.5 rounded-md text-xxs text-text-tertiary hover:text-text-secondary hover:bg-bg-hover transition-colors cursor-pointer"
      >
        {fromEmail}
        <IoChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 min-w-72 py-1 rounded-lg border border-border-secondary bg-bg-secondary shadow-xl z-50">
          {accounts.map(a => (
            <div key={a.id}>
              {accounts.length > 1 && (
                <div className="px-3 pt-2 pb-1 text-2xs font-medium text-text-tertiary uppercase tracking-wider">
                  {a.name}
                </div>
              )}
              {[a.email, ...(a.aliases || [])].map(email => {
                const selected = email === fromEmail;
                return (
                  <button
                    key={email}
                    onClick={() => { onChange(email, a.id); setOpen(false); }}
                    className={`flex items-center gap-2 w-full px-3 py-1.5 text-left cursor-pointer transition-colors ${
                      selected
                        ? 'bg-accent/10 text-accent'
                        : 'text-text-secondary hover:bg-bg-hover'
                    }`}
                  >
                    <span className="flex-1 text-xs truncate">{email}</span>
                    {email !== a.email && (
                      <span className="text-2xs text-text-tertiary px-1.5 py-0.5 rounded bg-bg-tertiary">alias</span>
                    )}
                    {selected && <IoCheckmarkOutline size={13} className="shrink-0 text-accent" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type AITone = 'professional' | 'casual' | 'friendly' | 'formal' | 'concise';

const AI_TONES: { id: AITone; label: string }[] = [
  { id: 'professional', label: 'Professional' },
  { id: 'casual', label: 'Casual' },
  { id: 'friendly', label: 'Friendly' },
  { id: 'formal', label: 'Formal' },
  { id: 'concise', label: 'Concise' },
];

export default function ComposeWindow() {
  const [compose, setCompose] = useAtom(composeOpenAtom);
  const [pendingSend, setPendingSend] = useAtom(pendingSendAtom);
  const allAccounts = useAtomValue(accountsAtom);
  const activeAccountId = useAtomValue(activeAccountIdAtom);
  const threads = useAtomValue(threadsAtom);
  // When viewing a specific account's inbox, only show that account's emails in the from picker
  const accounts = activeAccountId
    ? allAccounts.filter(a => a.id === activeAccountId)
    : allAccounts;
  const undoDelay = useAtomValue(undoSendDelayAtom);
  const saveDraft = useSetAtom(saveDraftAtom);
  const destroyDraft = useSetAtom(destroyDraftAtom);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [focused, setFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiTone, setAiTone] = useState<AITone>('professional');
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const aiRef = useRef<HTMLDivElement>(null);
  const handleSendRef = useRef<() => void>();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: { HTMLAttributes: { class: 'email-code-block' } },
      }),
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: 'Write your message...' }),
    ],
    content: compose?.body || '',
    editorProps: {
      attributes: { class: 'prose-editor outline-none px-3 py-2.5 max-h-64 overflow-y-auto' },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          handleSendRef.current?.();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      // Sync body changes back to compose state and trigger debounced save
      const html = ed.getHTML();
      setCompose(prev => prev ? { ...prev, body: html } : prev);
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      draftTimerRef.current = setTimeout(() => saveDraft(), 5000);
    },
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  });

  // Close AI panel on outside click
  useEffect(() => {
    if (!aiOpen) return;
    const handle = (e: MouseEvent) => {
      if (aiRef.current && !aiRef.current.contains(e.target as Node)) setAiOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [aiOpen]);

  useEffect(() => {
    if (compose && editor) {
      setTimeout(() => editor.commands.focus('end'), 200);
    }
  }, [compose?.mode, editor]);

  // Save draft when navigating away (compose set to null by external action)
  const composeRef = useRef(compose);
  composeRef.current = compose;
  useEffect(() => {
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      // If compose still has content when unmounting, save it
      const c = composeRef.current;
      if (c && (c.to.length > 0 || c.subject || c.body)) {
        saveDraft();
      }
    };
  }, [saveDraft]);

  if (!compose) return null;

  const update = (partial: Partial<ComposeState>) => {
    setCompose({ ...compose, ...partial });
    // Debounced auto-save draft (5s after last edit)
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => saveDraft(), 5000);
  };

  const sendAccount = compose.accountId
    ? accounts.find(a => a.id === compose.accountId)
    : accounts[0];
  const fromEmail = compose.fromEmail || sendAccount?.email || '';
  const fromName = sendAccount?.name || '';

  const hasBody = editor ? !editor.isEmpty : false;
  const canSend = compose.to.length > 0 && compose.subject.trim() && hasBody;

  const handleSend = async () => {
    if (!canSend || !sendAccount || !window.api || !editor) return;

    let bodyHtml = editor.getHTML();

    // Append signature if configured for this from-address
    const sig = await window.api.getSignature?.(fromEmail);
    if (sig) {
      bodyHtml += `<div class="email-signature" style="margin-top:16px;padding-top:8px;border-top:1px solid #ddd">${sig}</div>`;
    }

    const draft = {
      id: `local-draft-${Date.now()}`,
      headerMessageId: `<${Date.now()}.${Math.random().toString(36).slice(2)}@mailspring.com>`,
      to: compose.to,
      cc: compose.cc,
      bcc: compose.bcc,
      from: [{ name: fromName, email: fromEmail }],
      subject: compose.subject,
      body: bodyHtml,
      plaintext: false,
      date: Math.floor(Date.now() / 1000),
      version: 1,
    };

    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);

    if (undoDelay > 0) {
      setPendingSend({
        accountId: sendAccount.id,
        draft,
        compose: { ...compose },
        queuedAt: Date.now(),
      });
      if (compose?.draftId) destroyDraft();
      setCompose(null);
    } else {
      setSending(true);
      setSendError(null);
      try {
        const result = await window.api.queueTask(sendAccount.id, {
          type: 'SendDraftTask',
          draft,
        });
        if (result && !result.sent) {
          setSendError(result.error || 'Failed to queue send task');
          return;
        }
        if (compose?.draftId) destroyDraft();
        setCompose(null);
      } catch (err: any) {
        setSendError(err?.message || 'Send failed');
      } finally {
        setSending(false);
      }
    }
  };

  const handleAIDraft = async () => {
    if (!compose) return;
    if (!window.api?.draftWithAI) {
      setAiError('AI drafting is not available. Restart the app to load the latest version.');
      return;
    }
    setAiLoading(true);
    setAiError(null);

    let threadMessages: { from: string; date: string; body: string }[] | undefined;
    if (compose.mode === 'reply' && compose.threadId) {
      const thread = threads.find(t => t.id === compose.threadId);
      if (thread?.messages?.length) {
        threadMessages = thread.messages.map(m => {
          const plainBody = (m.body || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          return {
            from: `${m.from?.name || ''} <${m.from?.email || ''}>`,
            date: m.date instanceof Date ? m.date.toISOString() : String(m.date || ''),
            body: plainBody || m.snippet || m.subject || '',
          };
        });
      }
    }

    const currentText = editor?.getText() || '';
    const hasExistingBody = currentText.trim().length > 0;

    try {
      const result = await window.api.draftWithAI({
        mode: hasExistingBody ? 'rewrite' : (compose.mode === 'reply' ? 'reply' : 'new'),
        threadMessages,
        subject: compose.subject,
        to: compose.to.map(c => c.name ? `${c.name} <${c.email}>` : c.email),
        existingBody: hasExistingBody ? currentText : undefined,
        instruction: aiInstruction || undefined,
        tone: aiTone,
        senderName: fromName,
      });

      if (result.success && editor) {
        editor.commands.setContent(result.body);
        setAiOpen(false);
        setAiInstruction('');
        setTimeout(() => editor.commands.focus('end'), 100);
      } else {
        setAiError(result.error);
      }
    } catch (err: any) {
      setAiError(err?.message || 'AI generation failed');
    } finally {
      setAiLoading(false);
    }
  };

  handleSendRef.current = handleSend;

  const handleDiscard = () => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    if (compose?.draftId) destroyDraft();
    setCompose(null);
  };

  return (
    <div className="flex-1 flex flex-col bg-bg-primary min-w-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border-secondary shrink-0">
        <button onClick={handleDiscard} className="p-1.5 -ml-1 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-hover cursor-pointer">
          <IoArrowBackOutline size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-text-primary truncate">
            {compose.subject || 'New Message'}
          </h2>
        </div>
        <button
          onClick={handleDiscard}
          className="px-3 py-1.5 rounded-md text-xs text-text-tertiary hover:text-text-secondary hover:bg-bg-hover transition-colors cursor-pointer"
        >
          Discard
        </button>
      </div>

      {/* Envelope fields — compact top section */}
      <div className="px-5 py-3 space-y-2 border-b border-border-secondary/50 shrink-0">
        <div className="flex items-baseline gap-2">
          <span className="text-xxs text-text-tertiary shrink-0">From</span>
          <FromSelector
            accounts={accounts}
            fromEmail={fromEmail}
            onChange={(email, accountId) => update({ fromEmail: email, accountId })}
          />
        </div>

        <ContactChips label="To" value={compose.to} onChange={to => update({ to })} autoFocus={compose.mode === 'new'} />

        {(showCc || compose.cc.length > 0) && (
          <ContactChips label="Cc" value={compose.cc} onChange={cc => update({ cc })} />
        )}
        {(showBcc || compose.bcc.length > 0) && (
          <ContactChips label="Bcc" value={compose.bcc} onChange={bcc => update({ bcc })} />
        )}

        {!showCc && !showBcc && (
          <div className="flex gap-2 pl-8">
            <button onClick={() => setShowCc(true)} className="text-xxs text-text-tertiary hover:text-text-secondary cursor-pointer">Cc</button>
            <button onClick={() => setShowBcc(true)} className="text-xxs text-text-tertiary hover:text-text-secondary cursor-pointer">Bcc</button>
          </div>
        )}

        <div className="flex items-baseline gap-2">
          <span className="text-xxs text-text-tertiary shrink-0">Subject</span>
          <input
            type="text"
            value={compose.subject}
            onChange={e => update({ subject: e.target.value })}
            placeholder="What's this about?"
            className="flex-1 bg-transparent text-xs text-text-primary outline-none placeholder:text-text-tertiary"
          />
        </div>
      </div>

      {/* Spacer — pushes compose input to bottom */}
      <div className="flex-1" />

      {/* Send error */}
      {sendError && (
        <div className="mx-4 mb-1 px-3 py-1.5 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-400">
          {sendError}
        </div>
      )}

      {/* Chat-style compose input — same pattern as ComposeBar */}
      <div className={`mx-4 mb-3 rounded-lg border transition-colors ${focused ? 'border-accent/50 bg-bg-secondary' : 'border-border-primary bg-bg-tertiary'}`}>
        {/* AI panel */}
        {aiOpen && (
          <div ref={aiRef} className="px-3 pt-3 pb-2 border-b border-border-secondary/50">
            <div className="flex items-center gap-1.5 mb-2">
              <IoSparklesOutline size={13} className="text-accent shrink-0" />
              <span className="text-xs font-medium text-text-primary">AI Draft</span>
              <span className="text-xxs text-text-tertiary ml-1">
                {hasBody ? 'Rewrite your draft' : compose.mode === 'reply' ? 'Draft a reply' : 'Help write'}
              </span>
            </div>

            <div className="flex items-center gap-1 mb-2">
              {AI_TONES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setAiTone(t.id)}
                  className={`px-2 py-0.5 rounded-full text-xxs transition-colors cursor-pointer ${
                    aiTone === t.id
                      ? 'bg-accent/15 text-accent font-medium'
                      : 'text-text-tertiary hover:text-text-secondary hover:bg-bg-hover'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={aiInstruction}
                onChange={e => setAiInstruction(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !aiLoading) handleAIDraft(); }}
                placeholder={compose.mode === 'reply' ? 'e.g. "decline politely", "ask for details"...' : 'e.g. "introduce myself", "follow up on meeting"...'}
                className="flex-1 px-2.5 py-1.5 rounded-md bg-bg-primary border border-border-secondary text-xs text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent/50"
                autoFocus
              />
              <button
                onClick={handleAIDraft}
                disabled={aiLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent text-accent-text text-xs font-medium hover:bg-accent-hover transition-colors disabled:opacity-60 cursor-pointer disabled:cursor-default shrink-0"
              >
                <IoSparklesOutline size={12} />
                {aiLoading ? 'Writing...' : 'Generate'}
              </button>
            </div>

            {aiError && (
              <div className="mt-2 text-xxs text-red-400">{aiError}</div>
            )}
          </div>
        )}

        <div className="flex items-center gap-1">
          <div className="flex-1 min-w-0">
            <EditorContent editor={editor} />
          </div>
          {/* Standalone AI button when toolbar is hidden */}
          {!hasBody && !focused && !aiOpen && (
            <button
              onClick={() => setAiOpen(!aiOpen)}
              className="p-2 mr-1 rounded-md text-text-tertiary hover:text-text-secondary hover:bg-bg-hover transition-colors cursor-pointer"
              title="Draft with AI"
            >
              <IoSparklesOutline size={16} />
            </button>
          )}
        </div>

        {(hasBody || focused || aiOpen) && (
          <div className="flex items-center justify-between px-2 pb-2" onMouseDown={e => { if (e.target !== e.currentTarget) e.preventDefault(); }}>
            <div className="flex items-center gap-0.5">
              <FormattingToolbar editor={editor} />
              <div className="w-px h-4 bg-border-primary mx-1" />
              <button
                onClick={() => setAiOpen(!aiOpen)}
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  aiOpen ? 'text-accent bg-accent/10' : 'text-text-tertiary hover:text-text-secondary hover:bg-bg-hover'
                }`}
                title="AI Draft"
              >
                <IoSparklesOutline size={14} />
              </button>
            </div>
            <button
              onClick={handleSend}
              disabled={!canSend || sending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent text-accent-text text-xs font-medium hover:bg-accent-hover transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-default"
            >
              <IoSendOutline size={12} />
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
