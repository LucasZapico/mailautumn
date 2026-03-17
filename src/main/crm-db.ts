/**
 * CRM database — lightweight contact metadata store.
 * Separate from mailsync's edgehill.db (which is read-only from Electron).
 */

import Database from 'better-sqlite3';
import path from 'path';
import log from 'electron-log/main';
import { getConfigDir } from './database';

let db: Database.Database | null = null;

export function openCrmDb(): void {
  if (db) return;
  const dbPath = path.join(getConfigDir(), 'crm.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS Contact (
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

    CREATE TABLE IF NOT EXISTS Interaction (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_email TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      direction TEXT NOT NULL DEFAULT 'received',
      date TEXT NOT NULL,
      FOREIGN KEY (contact_email) REFERENCES Contact(email) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_interaction_contact ON Interaction(contact_email);
    CREATE INDEX IF NOT EXISTS idx_interaction_thread ON Interaction(thread_id);
    CREATE INDEX IF NOT EXISTS idx_contact_bucket ON Contact(bucket);
  `);

  // Migration: add bucket column if missing (existing DBs)
  try {
    db.prepare("SELECT bucket FROM Contact LIMIT 1").get();
  } catch {
    db.exec("ALTER TABLE Contact ADD COLUMN bucket TEXT NOT NULL DEFAULT ''");
    log.info('[crm] migrated: added bucket column');
  }

  log.info(`[crm] database opened: ${dbPath}`);
}

export function closeCrmDb(): void {
  if (db) {
    db.close();
    db = null;
  }
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
  if (!db) return null;
  const row = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM Interaction i WHERE i.contact_email = c.email) as interaction_count,
      (SELECT MAX(i.date) FROM Interaction i WHERE i.contact_email = c.email) as last_interaction
    FROM Contact c WHERE c.email = ?
  `).get(email.toLowerCase()) as any;
  return row ? rowToContact(row) : null;
}

export function upsertContact(contact: Partial<CrmContact> & { email: string }): CrmContact {
  if (!db) throw new Error('CRM database not open');
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
      db.prepare(`UPDATE Contact SET ${updates.join(', ')} WHERE email = ?`).run(...params);
    }
  } else {
    db.prepare(`
      INSERT INTO Contact (email, name, company, phone, notes, tags, bucket, starred)
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
  if (!db) return;
  db.prepare('DELETE FROM Contact WHERE email = ?').run(email.toLowerCase());
}

export function searchContacts(query: string, limit = 20): CrmContact[] {
  if (!db) return [];
  const q = `%${query.toLowerCase()}%`;
  const rows = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM Interaction i WHERE i.contact_email = c.email) as interaction_count,
      (SELECT MAX(i.date) FROM Interaction i WHERE i.contact_email = c.email) as last_interaction
    FROM Contact c
    WHERE c.email LIKE ? OR LOWER(c.name) LIKE ? OR LOWER(c.company) LIKE ? OR c.tags LIKE ?
    ORDER BY c.starred DESC, c.updated_at DESC
    LIMIT ?
  `).all(q, q, q, q, limit) as any[];
  return rows.map(rowToContact);
}

export function getAllContacts(limit = 100): CrmContact[] {
  if (!db) return [];
  const rows = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM Interaction i WHERE i.contact_email = c.email) as interaction_count,
      (SELECT MAX(i.date) FROM Interaction i WHERE i.contact_email = c.email) as last_interaction
    FROM Contact c
    ORDER BY c.starred DESC, c.updated_at DESC
    LIMIT ?
  `).all(limit) as any[];
  return rows.map(rowToContact);
}

export function getContactsByBucket(bucket: string, limit = 100): CrmContact[] {
  if (!db) return [];
  const rows = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM Interaction i WHERE i.contact_email = c.email) as interaction_count,
      (SELECT MAX(i.date) FROM Interaction i WHERE i.contact_email = c.email) as last_interaction
    FROM Contact c
    WHERE c.bucket = ?
    ORDER BY c.starred DESC, c.name ASC
    LIMIT ?
  `).all(bucket, limit) as any[];
  return rows.map(rowToContact);
}

export function getBuckets(): { bucket: string; count: number }[] {
  if (!db) return [];
  return db.prepare(`
    SELECT bucket, COUNT(*) as count
    FROM Contact
    WHERE bucket != ''
    GROUP BY bucket
    ORDER BY bucket ASC
  `).all() as { bucket: string; count: number }[];
}

// ── Interactions ──

export function addInteraction(contactEmail: string, threadId: string, subject: string, direction: 'sent' | 'received', date: string): void {
  if (!db) return;
  const email = contactEmail.toLowerCase();
  // Only track interactions for contacts already in the CRM
  const exists = db.prepare('SELECT 1 FROM Contact WHERE email = ?').get(email);
  if (!exists) return;
  // Avoid duplicate interactions for the same thread
  const dup = db.prepare('SELECT 1 FROM Interaction WHERE contact_email = ? AND thread_id = ? AND direction = ?').get(email, threadId, direction);
  if (!dup) {
    db.prepare('INSERT INTO Interaction (contact_email, thread_id, subject, direction, date) VALUES (?, ?, ?, ?, ?)').run(email, threadId, subject, direction, date);
  }
}

export function getInteractions(contactEmail: string, limit = 50): { threadId: string; subject: string; direction: string; date: string }[] {
  if (!db) return [];
  return db.prepare(`
    SELECT thread_id as threadId, subject, direction, date
    FROM Interaction WHERE contact_email = ?
    ORDER BY date DESC LIMIT ?
  `).all(contactEmail.toLowerCase(), limit) as any[];
}

export function getContactsForThread(threadId: string): CrmContact[] {
  if (!db) return [];
  const rows = db.prepare(`
    SELECT DISTINCT c.*,
      (SELECT COUNT(*) FROM Interaction i WHERE i.contact_email = c.email) as interaction_count,
      (SELECT MAX(i.date) FROM Interaction i WHERE i.contact_email = c.email) as last_interaction
    FROM Contact c
    JOIN Interaction i ON i.contact_email = c.email
    WHERE i.thread_id = ?
    ORDER BY c.starred DESC
  `).all(threadId) as any[];
  return rows.map(rowToContact);
}
