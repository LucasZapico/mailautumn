/**
 * CRM Contact Panel — shows in the message sidebar slot.
 * If the contact is in the CRM: shows editable fields, signature-extracted info, interaction history.
 * If not: shows an "Add to CRM" prompt with bucket picker.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  IoPersonOutline, IoBusinessOutline, IoCallOutline,
  IoCreateOutline, IoPricetagOutline, IoTimeOutline,
  IoChevronDown, IoChevronUp, IoAddOutline, IoCloseOutline,
  IoMailOutline, IoArrowForwardOutline, IoArrowBackOutline,
  IoGlobeOutline, IoLogoLinkedin, IoPersonAddOutline,
  IoTrashOutline, IoFolderOutline,
} from 'react-icons/io5';
import { selectedThreadAtom, accountEmailsAtom, accountsAtom, selectThreadAtom } from '../../atoms/app';
import {
  activeCrmContactAtom, crmInteractionsAtom, crmBucketsAtom,
  loadCrmContactAtom, saveCrmContactAtom, trackInteractionAtom,
  addToCrmAtom, removeFromCrmAtom, loadBucketsAtom,
  type CrmContact,
} from './atoms';
import { parseSignature, type SignatureInfo } from './signature-parser';

// ── Shared sub-components ──

function EditableField({ icon: Icon, label, value, onSave, placeholder, multiline }: {
  icon: React.ComponentType<{ size: number; className?: string }>;
  label: string;
  value: string;
  onSave: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const save = () => {
    if (draft !== value) onSave(draft);
    setEditing(false);
  };

  return (
    <div className="flex items-start gap-2 group">
      <Icon size={14} className="text-text-tertiary mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-2xs text-text-tertiary mb-0.5">{label}</div>
        {editing ? (
          multiline ? (
            <textarea
              ref={inputRef as React.Ref<never>} /* useRef<input|textarea> union — safe cast */
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={save}
              onKeyDown={e => { if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
              placeholder={placeholder}
              className="w-full text-xs text-text-primary bg-bg-tertiary border border-border-primary rounded px-2 py-1 outline-none resize-none"
              rows={3}
            />
          ) : (
            <input
              ref={inputRef as React.Ref<never>} /* useRef<input|textarea> union — safe cast */
              type="text"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={save}
              onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
              placeholder={placeholder}
              className="w-full text-xs text-text-primary bg-bg-tertiary border border-border-primary rounded px-2 py-1 outline-none"
            />
          )
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-text-secondary hover:text-text-primary cursor-pointer text-left w-full truncate"
          >
            {value || <span className="text-text-tertiary italic">{placeholder || 'Add...'}</span>}
          </button>
        )}
      </div>
    </div>
  );
}

function TagEditor({ tags, onSave }: { tags: string[]; onSave: (tags: string[]) => void }) {
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (adding) inputRef.current?.focus(); }, [adding]);

  const addTag = () => {
    const tag = input.trim().toLowerCase();
    if (tag && !tags.includes(tag)) onSave([...tags, tag]);
    setInput('');
    setAdding(false);
  };

  return (
    <div className="flex items-start gap-2">
      <IoPricetagOutline size={14} className="text-text-tertiary mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-2xs text-text-tertiary mb-1">Tags</div>
        <div className="flex flex-wrap gap-1">
          {tags.map(tag => (
            <span key={tag} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-accent/10 text-accent text-2xs">
              {tag}
              <button onClick={() => onSave(tags.filter(t => t !== tag))} className="hover:text-red-400 cursor-pointer">
                <IoCloseOutline size={10} />
              </button>
            </span>
          ))}
          {adding ? (
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onBlur={addTag}
              onKeyDown={e => { if (e.key === 'Enter') addTag(); if (e.key === 'Escape') { setInput(''); setAdding(false); } }}
              placeholder="tag name"
              className="w-16 text-2xs bg-bg-tertiary border border-border-primary rounded px-1 py-0.5 outline-none"
            />
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-dashed border-border-primary text-text-tertiary hover:text-text-secondary text-2xs cursor-pointer"
            >
              <IoAddOutline size={10} /> Add
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Add to CRM prompt ──

function AddToCrmPrompt({ email, name, sigInfo, buckets, onAdd }: {
  email: string;
  name: string;
  sigInfo: SignatureInfo | null;
  buckets: { bucket: string; count: number }[];
  onAdd: (bucket: string) => void;
}) {
  const accounts = useAtomValue(accountsAtom);
  const [selectedBucket, setSelectedBucket] = useState('');
  const [customBucket, setCustomBucket] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Default bucket options from account names
  const accountBuckets = accounts.map(a => a.name || a.email.split('@')[0]);
  const allBuckets = [...new Set([...accountBuckets, ...buckets.map(b => b.bucket)])];

  const handleAdd = () => {
    const bucket = selectedBucket === '__custom' ? customBucket.trim() : selectedBucket;
    if (bucket) onAdd(bucket);
  };

  return (
    <div className="w-72 border-l border-border-secondary bg-bg-primary flex flex-col shrink-0">
      <div className="px-4 pt-4 pb-3 border-b border-border-secondary">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-full bg-bg-tertiary flex items-center justify-center shrink-0">
            <IoPersonOutline size={16} className="text-text-tertiary" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-text-primary truncate">{name || email.split('@')[0]}</div>
            <div className="text-2xs text-text-tertiary truncate">{email}</div>
            {sigInfo?.title && <div className="text-2xs text-text-tertiary truncate mt-0.5">{sigInfo.title}</div>}
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-3">
        <div className="text-xs text-text-secondary">Add this contact to your CRM?</div>

        <div>
          <div className="text-2xs text-text-tertiary mb-1.5">Bucket</div>
          <div className="space-y-1">
            {allBuckets.map(b => (
              <button
                key={b}
                onClick={() => setSelectedBucket(b)}
                className={`flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                  selectedBucket === b
                    ? 'bg-accent/10 text-accent border border-accent/30'
                    : 'text-text-secondary hover:bg-bg-hover border border-transparent'
                }`}
              >
                <IoFolderOutline size={13} />
                {b}
              </button>
            ))}
            <button
              onClick={() => { setSelectedBucket('__custom'); setTimeout(() => inputRef.current?.focus(), 50); }}
              className={`flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                selectedBucket === '__custom'
                  ? 'bg-accent/10 text-accent border border-accent/30'
                  : 'text-text-secondary hover:bg-bg-hover border border-transparent'
              }`}
            >
              <IoAddOutline size={13} />
              New bucket...
            </button>
            {selectedBucket === '__custom' && (
              <input
                ref={inputRef}
                type="text"
                value={customBucket}
                onChange={e => setCustomBucket(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && customBucket.trim()) handleAdd(); }}
                placeholder="Bucket name"
                className="w-full text-xs bg-bg-tertiary border border-border-primary rounded-md px-2.5 py-1.5 outline-none mt-1"
              />
            )}
          </div>
        </div>

        <button
          onClick={handleAdd}
          disabled={!selectedBucket || (selectedBucket === '__custom' && !customBucket.trim())}
          className="flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-lg bg-accent text-white text-xs font-medium disabled:opacity-40 hover:bg-accent/90 transition-colors cursor-pointer disabled:cursor-default"
        >
          <IoPersonAddOutline size={14} />
          Add to CRM
        </button>
      </div>
    </div>
  );
}

// ── Main panel ──

export default function ContactPanel() {
  const thread = useAtomValue(selectedThreadAtom);
  const accountEmails = useAtomValue(accountEmailsAtom);
  const contact = useAtomValue(activeCrmContactAtom);
  const interactions = useAtomValue(crmInteractionsAtom);
  const buckets = useAtomValue(crmBucketsAtom);
  const loadContact = useSetAtom(loadCrmContactAtom);
  const saveContact = useSetAtom(saveCrmContactAtom);
  const trackInteraction = useSetAtom(trackInteractionAtom);
  const addToCrm = useSetAtom(addToCrmAtom);
  const removeFromCrm = useSetAtom(removeFromCrmAtom);
  const loadBuckets = useSetAtom(loadBucketsAtom);
  const selectThread = useSetAtom(selectThreadAtom);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Find the primary external participant
  const primaryEmail = thread?.participants.find(
    p => !accountEmails.has(p.email.toLowerCase())
  )?.email;

  // Extract signature info from the contact's messages
  const sigInfo = useMemo<SignatureInfo | null>(() => {
    if (!thread || !primaryEmail) return null;
    const theirMessages = thread.messages.filter(
      m => m.from?.email?.toLowerCase() === primaryEmail.toLowerCase() && m.body
    );
    for (let i = theirMessages.length - 1; i >= 0; i--) {
      const parsed = parseSignature(theirMessages[i].body);
      if (parsed) return parsed;
    }
    return null;
  }, [thread?.messages, primaryEmail]);

  // Load contact + buckets when thread changes
  useEffect(() => {
    if (primaryEmail) loadContact(primaryEmail);
    loadBuckets();
  }, [primaryEmail, loadContact, loadBuckets]);

  // Track interaction for existing CRM contacts
  useEffect(() => {
    if (!thread || !primaryEmail || !contact) return;
    const lastMsg = thread.messages[thread.messages.length - 1];
    if (!lastMsg) return;
    const direction = accountEmails.has(lastMsg.from?.email?.toLowerCase() || '') ? 'sent' : 'received';
    trackInteraction({
      contactEmail: primaryEmail,
      threadId: thread.id,
      subject: thread.subject,
      direction,
      date: lastMsg.date instanceof Date ? lastMsg.date.toISOString() : new Date(lastMsg.date).toISOString(),
    });
  }, [thread?.id, !!contact]);

  // Auto-populate CRM fields from signature when contact has empty fields
  useEffect(() => {
    if (!sigInfo || !primaryEmail || !contact) return;
    const updates: Record<string, string> = {};
    if (!contact.name && sigInfo.name) updates.name = sigInfo.name;
    if (!contact.company && sigInfo.company) updates.company = sigInfo.company;
    if (!contact.phone && sigInfo.phone) updates.phone = sigInfo.phone;
    if (Object.keys(updates).length > 0) {
      saveContact({ email: primaryEmail, ...updates });
    }
  }, [sigInfo, contact?.email]);

  if (!thread || !primaryEmail) return null;

  const participantName = thread.participants.find(p => p.email === primaryEmail)?.name || '';

  // Not in CRM — show add prompt
  if (!contact) {
    return (
      <AddToCrmPrompt
        email={primaryEmail}
        name={sigInfo?.name || participantName}
        sigInfo={sigInfo}
        buckets={buckets}
        onAdd={(bucket) => {
          addToCrm({
            email: primaryEmail,
            name: sigInfo?.name || participantName,
            company: sigInfo?.company,
            phone: sigInfo?.phone,
            bucket,
          });
        }}
      />
    );
  }

  // In CRM — show full panel
  const displayName = contact.name || sigInfo?.name || participantName;

  const update = (field: string, value: any) => {
    saveContact({ email: primaryEmail, [field]: value });
  };

  return (
    <div className="w-72 border-l border-border-secondary bg-bg-primary flex flex-col shrink-0 overflow-y-auto">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border-secondary">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
            <IoPersonOutline size={16} className="text-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-text-primary truncate">
              {displayName || primaryEmail.split('@')[0]}
            </div>
            <div className="text-2xs text-text-tertiary truncate">{primaryEmail}</div>
            {sigInfo?.title && (
              <div className="text-2xs text-text-tertiary truncate mt-0.5">{sigInfo.title}</div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-3 text-2xs text-text-tertiary">
            {contact.bucket && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-bg-tertiary">
                <IoFolderOutline size={10} />
                {contact.bucket}
              </span>
            )}
            {contact.interactionCount !== undefined && contact.interactionCount > 0 && (
              <span className="flex items-center gap-1">
                <IoMailOutline size={11} />
                {contact.interactionCount}
              </span>
            )}
            {contact.lastInteraction && (
              <span className="flex items-center gap-1">
                <IoTimeOutline size={11} />
                {new Date(contact.lastInteraction).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
          <button
            onClick={() => removeFromCrm(primaryEmail)}
            className="p-1 rounded text-text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
            title="Remove from CRM"
          >
            <IoTrashOutline size={13} />
          </button>
        </div>
      </div>

      {/* Fields */}
      <div className="px-4 py-3 space-y-3 border-b border-border-secondary">
        <EditableField
          icon={IoPersonOutline}
          label="Name"
          value={contact.name || participantName}
          onSave={v => update('name', v)}
          placeholder="Full name"
        />
        <EditableField
          icon={IoBusinessOutline}
          label="Company"
          value={contact.company || sigInfo?.company || ''}
          onSave={v => update('company', v)}
          placeholder="Company name"
        />
        <EditableField
          icon={IoCallOutline}
          label="Phone"
          value={contact.phone || sigInfo?.phone || ''}
          onSave={v => update('phone', v)}
          placeholder="Phone number"
        />
        {sigInfo?.website && (
          <div className="flex items-start gap-2">
            <IoGlobeOutline size={14} className="text-text-tertiary mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="text-2xs text-text-tertiary mb-0.5">Website</div>
              <a href={sigInfo.website} target="_blank" rel="noopener noreferrer"
                className="text-xs text-accent hover:underline truncate block">
                {sigInfo.website.replace(/^https?:\/\//, '')}
              </a>
            </div>
          </div>
        )}
        {sigInfo?.linkedin && (
          <div className="flex items-start gap-2">
            <IoLogoLinkedin size={14} className="text-text-tertiary mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="text-2xs text-text-tertiary mb-0.5">LinkedIn</div>
              <a href={sigInfo.linkedin} target="_blank" rel="noopener noreferrer"
                className="text-xs text-accent hover:underline truncate block">
                {sigInfo.linkedin.replace(/^https?:\/\//, '')}
              </a>
            </div>
          </div>
        )}
        <TagEditor
          tags={contact.tags || []}
          onSave={tags => update('tags', tags)}
        />
        <EditableField
          icon={IoCreateOutline}
          label="Notes"
          value={contact.notes || ''}
          onSave={v => update('notes', v)}
          placeholder="Add notes about this contact..."
          multiline
        />
      </div>

      {/* Interaction History */}
      <div className="px-4 py-3">
        <button
          onClick={() => setHistoryOpen(!historyOpen)}
          className="flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary cursor-pointer w-full"
        >
          {historyOpen ? <IoChevronUp size={12} /> : <IoChevronDown size={12} />}
          History ({interactions.length})
        </button>
        {historyOpen && interactions.length > 0 && (
          <div className="mt-2 space-y-1">
            {interactions.map((ix, i) => (
              <button
                key={i}
                onClick={() => selectThread(ix.threadId)}
                className="flex items-start gap-2 w-full text-left px-2 py-1.5 rounded hover:bg-bg-hover cursor-pointer transition-colors"
              >
                {ix.direction === 'sent' ? (
                  <IoArrowForwardOutline size={12} className="text-blue-400 mt-0.5 shrink-0" />
                ) : (
                  <IoArrowBackOutline size={12} className="text-green-400 mt-0.5 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-2xs text-text-secondary truncate">{ix.subject}</div>
                  <div className="text-2xs text-text-tertiary">
                    {new Date(ix.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
        {historyOpen && interactions.length === 0 && (
          <div className="mt-2 text-2xs text-text-tertiary">No interactions tracked yet.</div>
        )}
      </div>
    </div>
  );
}
