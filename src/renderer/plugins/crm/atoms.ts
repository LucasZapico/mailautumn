import { atom } from 'jotai';

export interface CrmContact {
  email: string;
  name: string;
  company: string;
  phone: string;
  notes: string;
  tags: string[];
  bucket: string;
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

export interface CrmBucket {
  bucket: string;
  count: number;
}

/** Currently viewed CRM contact (set when a thread participant is selected) */
export const activeCrmContactAtom = atom<CrmContact | null>(null);

/** Interactions for the active CRM contact */
export const crmInteractionsAtom = atom<CrmInteraction[]>([]);

/** Available buckets */
export const crmBucketsAtom = atom<CrmBucket[]>([]);

/** Contacts in the currently selected bucket */
export const crmBucketContactsAtom = atom<CrmContact[]>([]);

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

/** Add a contact to the CRM with a bucket assignment */
export const addToCrmAtom = atom(null, async (_get, set, params: {
  email: string;
  name?: string;
  company?: string;
  phone?: string;
  bucket: string;
}) => {
  if (!window.api?.crmUpsertContact) return;
  const saved = await window.api.crmUpsertContact(params);
  set(activeCrmContactAtom, saved);
  // Refresh buckets
  if (window.api.crmBuckets) {
    const buckets = await window.api.crmBuckets();
    set(crmBucketsAtom, buckets || []);
  }
});

/** Remove a contact from the CRM */
export const removeFromCrmAtom = atom(null, async (_get, set, email: string) => {
  if (!window.api?.crmDeleteContact) return;
  await window.api.crmDeleteContact(email);
  set(activeCrmContactAtom, null);
  set(crmInteractionsAtom, []);
  if (window.api.crmBuckets) {
    const buckets = await window.api.crmBuckets();
    set(crmBucketsAtom, buckets || []);
  }
});

/** Load buckets list */
export const loadBucketsAtom = atom(null, async (_get, set) => {
  if (!window.api?.crmBuckets) return;
  const buckets = await window.api.crmBuckets();
  set(crmBucketsAtom, buckets || []);
});

/** Load contacts for a specific bucket */
export const loadBucketContactsAtom = atom(null, async (_get, set, bucket: string) => {
  if (!window.api?.crmContactsByBucket) return;
  const contacts = await window.api.crmContactsByBucket(bucket);
  set(crmBucketContactsAtom, contacts || []);
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
