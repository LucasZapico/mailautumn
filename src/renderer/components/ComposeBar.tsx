import { useState, useRef, useEffect, useCallback } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { IoSendOutline, IoSparklesOutline } from 'react-icons/io5';
import { accountsAtom, accountEmailsAtom, undoSendDelayAtom, pendingSendAtom } from '../atoms/app';
import FormattingToolbar from './FormattingToolbar';
import type { Thread } from '../data/types';

type AITone = 'professional' | 'casual' | 'friendly' | 'formal' | 'concise';

const AI_TONES: { id: AITone; label: string }[] = [
  { id: 'professional', label: 'Professional' },
  { id: 'casual', label: 'Casual' },
  { id: 'friendly', label: 'Friendly' },
  { id: 'formal', label: 'Formal' },
  { id: 'concise', label: 'Concise' },
];

export default function ComposeBar({ thread, onGrow }: { thread: Thread; onGrow?: () => void }) {
  const [focused, setFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accounts = useAtomValue(accountsAtom);
  const accountEmails = useAtomValue(accountEmailsAtom);
  const undoDelay = useAtomValue(undoSendDelayAtom);
  const [pendingSend, setPendingSend] = useAtom(pendingSendAtom);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiTone, setAiTone] = useState<AITone>('professional');
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const aiRef = useRef<HTMLDivElement>(null);
  const handleSendRef = useRef<() => void>();

  // Track whether editor has content (for UI visibility)
  const [hasContent, setHasContent] = useState(false);

  // Find the account that owns this thread (needed by editor placeholder)
  const account = accounts.find(a => a.id === thread.accountId) || accounts[0];

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: { HTMLAttributes: { class: 'email-code-block' } },
      }),
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({
        placeholder: () => {
          const rTo = thread.participants.filter(p => p.email !== account?.email)[0];
          return rTo ? `Reply to ${rTo.name || rTo.email}...` : 'Write a reply...';
        },
      }),
    ],
    editorProps: {
      attributes: { class: 'prose-editor outline-none px-3 py-2.5 max-h-48 overflow-y-auto' },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          handleSendRef.current?.();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => {
      const empty = e.isEmpty;
      setHasContent(!empty);
      onGrow?.();
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

  if (!account) return null;

  // Figure out "from" — use the account email (or alias if thread was sent to an alias)
  const allAliases = new Set([account.email.toLowerCase(), ...(account.aliases || []).map(a => a.toLowerCase())]);
  const threadAlias = thread.participants.find(p => allAliases.has(p.email.toLowerCase()));
  const fromEmail = threadAlias?.email || account.email;
  const fromName = account.name;

  // Reply recipients
  const lastMessage = thread.messages[thread.messages.length - 1];
  const selfEmails = allAliases;
  const replyTo = lastMessage
    ? [lastMessage.from, ...(lastMessage.to || []), ...(lastMessage.cc || [])]
        .filter(c => !selfEmails.has(c.email.toLowerCase()))
        .filter((c, i, arr) => arr.findIndex(x => x.email.toLowerCase() === c.email.toLowerCase()) === i)
    : thread.participants.filter(p => !selfEmails.has(p.email.toLowerCase()));

  const canSend = hasContent && !sending;

  const handleAIDraft = async () => {
    if (!window.api?.draftWithAI) {
      setAiError('AI drafting is not available.');
      return;
    }
    setAiLoading(true);
    setAiError(null);

    const threadMessages = thread.messages.map(m => {
      const plainBody = (m.body || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      return {
        from: `${m.from?.name || ''} <${m.from?.email || ''}>`,
        date: m.date instanceof Date ? m.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : String(m.date),
        body: plainBody || m.snippet || m.subject || '',
      };
    });

    const currentText = editor?.getText() || '';
    const hasExistingBody = currentText.trim().length > 0;

    try {
      const result = await window.api.draftWithAI({
        mode: hasExistingBody ? 'rewrite' : 'reply',
        threadMessages,
        subject: thread.subject,
        to: replyTo.map(c => c.name ? `${c.name} <${c.email}>` : c.email),
        existingBody: hasExistingBody ? currentText : undefined,
        instruction: aiInstruction || undefined,
        tone: aiTone,
        senderName: fromName,
      });

      if (result.success && editor) {
        editor.commands.setContent(result.body);
        setHasContent(true);
        setAiOpen(false);
        setAiInstruction('');
      } else {
        setAiError(result.error);
      }
    } catch (err: any) {
      setAiError(err?.message || 'AI generation failed');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSend = async () => {
    if (!canSend || !window.api || !editor) return;

    const subject = thread.subject.startsWith('Re:') ? thread.subject : `Re: ${thread.subject}`;
    const bodyHtml = editor.getHTML();
    const bodyText = editor.getText();

    const draft = {
      id: `local-draft-${Date.now()}`,
      headerMessageId: `<${Date.now()}.${Math.random().toString(36).slice(2)}@mailspring.com>`,
      threadId: thread.id,
      replyToHeaderId: lastMessage?.headerMessageId || undefined,
      to: replyTo.map(c => ({ name: c.name, email: c.email })),
      cc: [],
      bcc: [],
      from: [{ name: fromName, email: fromEmail }],
      subject,
      body: bodyHtml,
      plaintext: false,
      date: Math.floor(Date.now() / 1000),
      version: 1,
    };

    if (undoDelay > 0) {
      setPendingSend({
        accountId: account.id,
        draft,
        compose: { mode: 'reply' as const, to: replyTo, cc: [], bcc: [], subject, body: bodyText },
        queuedAt: Date.now(),
      });
      editor.commands.clearContent();
      setHasContent(false);
      setError(null);
    } else {
      setSending(true);
      setError(null);
      try {
        const result = await window.api.queueTask(account.id, {
          type: 'SendDraftTask',
          draft,
        });
        if (result && !result.sent) {
          setError(result.error || 'Failed to queue send task');
          return;
        }
        editor.commands.clearContent();
        setHasContent(false);
      } catch (err: any) {
        setError(err?.message || 'Send failed');
      } finally {
        setSending(false);
      }
    }
  };

  handleSendRef.current = handleSend;

  return (
    <div>
      {error && (
        <div className="mx-4 mb-1 px-3 py-1.5 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-400">
          {error}
        </div>
      )}
      <div className={`mx-4 mb-3 rounded-lg border transition-colors ${focused ? 'border-accent/50 bg-bg-secondary' : 'border-border-primary bg-bg-tertiary'}`}>
        {/* AI panel */}
        {aiOpen && (
          <div ref={aiRef} className="px-3 pt-3 pb-2 border-b border-border-secondary/50">
            <div className="flex items-center gap-1.5 mb-2">
              <IoSparklesOutline size={13} className="text-accent shrink-0" />
              <span className="text-xs font-medium text-text-primary">AI Draft</span>
              <span className="text-xxs text-text-tertiary ml-1">
                {hasContent ? 'Rewrite your draft' : 'Draft a reply'}
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
                placeholder='e.g. "decline politely", "ask for details"...'
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
          {/* AI button when toolbar hidden */}
          {!hasContent && !focused && !aiOpen && (
            <button
              onClick={() => setAiOpen(!aiOpen)}
              className="p-2 mr-1 rounded-md text-text-tertiary hover:text-text-secondary hover:bg-bg-hover transition-colors cursor-pointer"
              title="Draft reply with AI"
            >
              <IoSparklesOutline size={16} />
            </button>
          )}
        </div>
        {(hasContent || focused || aiOpen) && (
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
              disabled={!canSend}
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
