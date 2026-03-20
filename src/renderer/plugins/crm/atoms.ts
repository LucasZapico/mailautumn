import { atom } from 'jotai';

export interface CrmContact {
  email: string;
  name: string;
  company: string;
  phone: string;
  notes: string;
  tags: string[];
  tag: string;
  followUp: string;
  starred: boolean;
  createdAt: string;
  updatedAt: string;
  interactionCount?: number;
  lastInteraction?: string;
}

export interface CrmInteraction {
  threadId: string;
  subject: string;
  direction: string;
  date: string;
}

export interface CrmTag {
  tag: string;
  count: number;
}

/** Currently viewed CRM contact (set when a thread participant is selected) */
export const activeCrmContactAtom = atom<CrmContact | null>(null);

/** Interactions for the active CRM contact */
export const crmInteractionsAtom = atom<CrmInteraction[]>([]);

/** Available tags */
export const crmTagsAtom = atom<CrmTag[]>([]);

/** Contacts in the currently selected tag */
export const crmTagContactsAtom = atom<CrmContact[]>([]);

/** Load a contact from the CRM database */
export const loadCrmContactAtom = atom(null, async (_get, set, email: string) => {
  if (!window.api?.crmGetContact) return;
  const contact = await window.api.crmGetContact(email);
  set(activeCrmContactAtom, contact);
  if (contact) {
    const interactions = await window.api.crmGetInteractions(email, 20);
    set(crmInteractionsAtom, interactions || []);
  } else {
    set(crmInteractionsAtom, []);
  }
});

/** Save contact updates */
export const saveCrmContactAtom = atom(null, async (_get, set, updates: Partial<CrmContact> & { email: string }) => {
  if (!window.api?.crmUpsertContact) return;
  const saved = await window.api.crmUpsertContact(updates);
  set(activeCrmContactAtom, saved);
});

/** Add a contact to the CRM with a tag assignment */
export const addToCrmAtom = atom(null, async (_get, set, params: {
  email: string;
  name?: string;
  company?: string;
  phone?: string;
  tag: string;
}) => {
  if (!window.api?.crmUpsertContact) return;
  const saved = await window.api.crmUpsertContact(params);
  set(activeCrmContactAtom, saved);
  // Refresh tags
  if (window.api.crmTags) {
    const tags = await window.api.crmTags();
    set(crmTagsAtom, tags || []);
  }
});

/** Remove a contact from the CRM */
export const removeFromCrmAtom = atom(null, async (_get, set, email: string) => {
  if (!window.api?.crmDeleteContact) return;
  await window.api.crmDeleteContact(email);
  set(activeCrmContactAtom, null);
  set(crmInteractionsAtom, []);
  if (window.api.crmTags) {
    const tags = await window.api.crmTags();
    set(crmTagsAtom, tags || []);
  }
});

/** Load tags list */
export const loadTagsAtom = atom(null, async (_get, set) => {
  if (!window.api?.crmTags) return;
  const tags = await window.api.crmTags();
  set(crmTagsAtom, tags || []);
});

/** Load contacts for a specific tag */
export const loadTagContactsAtom = atom(null, async (_get, set, tag: string) => {
  if (!window.api?.crmContactsByTag) return;
  const contacts = await window.api.crmContactsByTag(tag);
  set(crmTagContactsAtom, contacts || []);
});

/** Rename a tag across all contacts */
export const renameTagAtom = atom(null, async (_get, set, { oldName, newName }: { oldName: string; newName: string }) => {
  if (!window.api?.crmRenameTag) return;
  await window.api.crmRenameTag(oldName, newName);
  // Refresh tags and active contact
  if (window.api.crmTags) {
    const tags = await window.api.crmTags();
    set(crmTagsAtom, tags || []);
  }
  const contact = _get(activeCrmContactAtom);
  if (contact?.tag === oldName) {
    set(activeCrmContactAtom, { ...contact, tag: newName });
  }
});

/** Delete a tag (unassigns from all contacts) */
export const deleteTagAtom = atom(null, async (_get, set, name: string) => {
  if (!window.api?.crmDeleteTag) return;
  await window.api.crmDeleteTag(name);
  if (window.api.crmTags) {
    const tags = await window.api.crmTags();
    set(crmTagsAtom, tags || []);
  }
  const contact = _get(activeCrmContactAtom);
  if (contact?.tag === name) {
    set(activeCrmContactAtom, { ...contact, tag: '' });
  }
});

/** Track an interaction (only for existing CRM contacts) */
export const trackInteractionAtom = atom(null, async (_get, _set, params: {
  contactEmail: string;
  threadId: string;
  subject: string;
  direction: 'sent' | 'received';
  date: string;
}) => {
  if (!window.api?.crmAddInteraction) return;
  await window.api.crmAddInteraction(params.contactEmail, params.threadId, params.subject, params.direction, params.date);
});
