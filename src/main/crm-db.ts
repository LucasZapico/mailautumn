/**
 * CRM database — lightweight contact metadata store.
 * Uses the shared edgehill.db instance (mailsync ignores unknown tables).
 */

import log from 'electron-log/main';
import { getDb } from './database';

export function openCrmDb(): void {
  const db = getDb();
  if (!db) {
    log.warn('[crm] database not open yet, skipping CRM init');
    return;
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS CrmContact (
      email TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      company TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      bucket TEXT NOT NULL DEFAULT '',
      starred INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS CrmInteraction (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_email TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      direction TEXT NOT NULL DEFAULT 'received',
      date TEXT NOT NULL,
      FOREIGN KEY (contact_email) REFERENCES CrmContact(email) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_crm_interaction_contact ON CrmInteraction(contact_email);
    CREATE INDEX IF NOT EXISTS idx_crm_interaction_thread ON CrmInteraction(thread_id);
    CREATE INDEX IF NOT EXISTS idx_crm_contact_bucket ON CrmContact(bucket);
  `);

  log.info('[crm] tables initialized');
}

export function closeCrmDb(): void {
  // No-op — shared DB closed by database.ts
}

// ── Contact CRUD ──

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

function rowToContact(row: any): CrmContact {
  return {
    email: row.email,
    name: row.name,
    company: row.company,
    phone: row.phone,
    notes: row.notes,
    tags: JSON.parse(row.tags || '[]'),
    bucket: row.bucket || '',
    starred: !!row.starred,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    interactionCount: row.interaction_count,
    lastInteraction: row.last_interaction,
  };
}

export function getContact(email: string): CrmContact | null {
  const db = getDb();
  if (!db) return null;
  const row = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM CrmInteraction i WHERE i.contact_email = c.email) as interaction_count,
      (SELECT MAX(i.date) FROM CrmInteraction i WHERE i.contact_email = c.email) as last_interaction
    FROM CrmContact c WHERE c.email = ?
  `).get(email.toLowerCase()) as any;
  return row ? rowToContact(row) : null;
}

export function upsertContact(contact: Partial<CrmContact> & { email: string }): CrmContact {
  const db = getDb();
  if (!db) throw new Error('Database not open');
  const email = contact.email.toLowerCase();
  const existing = getContact(email);

  if (existing) {
    const updates: string[] = [];
    const params: any[] = [];
    if (contact.name !== undefined) { updates.push('name = ?'); params.push(contact.name); }
    if (contact.company !== undefined) { updates.push('company = ?'); params.push(contact.company); }
    if (contact.phone !== undefined) { updates.push('phone = ?'); params.push(contact.phone); }
    if (contact.notes !== undefined) { updates.push('notes = ?'); params.push(contact.notes); }
    if (contact.tags !== undefined) { updates.push('tags = ?'); params.push(JSON.stringify(contact.tags)); }
    if (contact.bucket !== undefined) { updates.push('bucket = ?'); params.push(contact.bucket); }
    if (contact.starred !== undefined) { updates.push('starred = ?'); params.push(contact.starred ? 1 : 0); }
    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      params.push(email);
      db.prepare(`UPDATE CrmContact SET ${updates.join(', ')} WHERE email = ?`).run(...params);
    }
  } else {
    db.prepare(`
      INSERT INTO CrmContact (email, name, company, phone, notes, tags, bucket, starred)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      email,
      contact.name || '',
      contact.company || '',
      contact.phone || '',
      contact.notes || '',
      JSON.stringify(contact.tags || []),
      contact.bucket || '',
      contact.starred ? 1 : 0,
    );
  }
  return getContact(email)!;
}

export function deleteContact(email: string): void {
  const db = getDb();
  if (!db) return;
  db.prepare('DELETE FROM CrmContact WHERE email = ?').run(email.toLowerCase());
}

export function searchContacts(query: string, limit = 20): CrmContact[] {
  const db = getDb();
  if (!db) return [];
  const q = `%${query.toLowerCase()}%`;
  const rows = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM CrmInteraction i WHERE i.contact_email = c.email) as interaction_count,
      (SELECT MAX(i.date) FROM CrmInteraction i WHERE i.contact_email = c.email) as last_interaction
    FROM CrmContact c
    WHERE c.email LIKE ? OR LOWER(c.name) LIKE ? OR LOWER(c.company) LIKE ? OR c.tags LIKE ?
    ORDER BY c.starred DESC, c.updated_at DESC
    LIMIT ?
  `).all(q, q, q, q, limit) as any[];
  return rows.map(rowToContact);
}

export function getAllContacts(limit = 100): CrmContact[] {
  const db = getDb();
  if (!db) return [];
  const rows = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM CrmInteraction i WHERE i.contact_email = c.email) as interaction_count,
      (SELECT MAX(i.date) FROM CrmInteraction i WHERE i.contact_email = c.email) as last_interaction
    FROM CrmContact c
    ORDER BY c.starred DESC, c.updated_at DESC
    LIMIT ?
  `).all(limit) as any[];
  return rows.map(rowToContact);
}

export function getContactsByBucket(bucket: string, limit = 100): CrmContact[] {
  const db = getDb();
  if (!db) return [];
  const rows = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM CrmInteraction i WHERE i.contact_email = c.email) as interaction_count,
      (SELECT MAX(i.date) FROM CrmInteraction i WHERE i.contact_email = c.email) as last_interaction
    FROM CrmContact c
    WHERE c.bucket = ?
    ORDER BY c.starred DESC, c.name ASC
    LIMIT ?
  `).all(bucket, limit) as any[];
  return rows.map(rowToContact);
}

export function getBuckets(): { bucket: string; count: number }[] {
  const db = getDb();
  if (!db) return [];
  return db.prepare(`
    SELECT bucket, COUNT(*) as count
    FROM CrmContact
    WHERE bucket != ''
    GROUP BY bucket
    ORDER BY bucket ASC
  `).all() as { bucket: string; count: number }[];
}

// ── Interactions ──

export function addInteraction(contactEmail: string, threadId: string, subject: string, direction: 'sent' | 'received', date: string): void {
  const db = getDb();
  if (!db) return;
  const email = contactEmail.toLowerCase();
  // Only track interactions for contacts already in the CRM
  const exists = db.prepare('SELECT 1 FROM CrmContact WHERE email = ?').get(email);
  if (!exists) return;
  const dup = db.prepare('SELECT 1 FROM CrmInteraction WHERE contact_email = ? AND thread_id = ? AND direction = ?').get(email, threadId, direction);
  if (!dup) {
    db.prepare('INSERT INTO CrmInteraction (contact_email, thread_id, subject, direction, date) VALUES (?, ?, ?, ?, ?)').run(email, threadId, subject, direction, date);
  }
}

export function getInteractions(contactEmail: string, limit = 50): { threadId: string; subject: string; direction: string; date: string }[] {
  const db = getDb();
  if (!db) return [];
  return db.prepare(`
    SELECT thread_id as threadId, subject, direction, date
    FROM CrmInteraction WHERE contact_email = ?
    ORDER BY date DESC LIMIT ?
  `).all(contactEmail.toLowerCase(), limit) as any[];
}

export function getContactsForThread(threadId: string): CrmContact[] {
  const db = getDb();
  if (!db) return [];
  const rows = db.prepare(`
    SELECT DISTINCT c.*,
      (SELECT COUNT(*) FROM CrmInteraction i WHERE i.contact_email = c.email) as interaction_count,
      (SELECT MAX(i.date) FROM CrmInteraction i WHERE i.contact_email = c.email) as last_interaction
    FROM CrmContact c
    JOIN CrmInteraction i ON i.contact_email = c.email
    WHERE i.thread_id = ?
    ORDER BY c.starred DESC
  `).all(threadId) as any[];
  return rows.map(rowToContact);
}
