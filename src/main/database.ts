import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import log from 'electron-log/main';
import type BetterSqlite3 from 'better-sqlite3';
import { classifyEmail, type EmailType, type BodyHints } from './classify-email';
import { extractMeta, type ThreadMeta } from './extract-meta';
import { getCachedType, queueForAIClassification, getAISettings } from './ai-classify';
import { getOverride, getSenderRule } from './manual-overrides';

// Native modules must be loaded via require() to avoid Vite bundling
const require2 = createRequire(import.meta.url);
const Database = require2('better-sqlite3') as typeof BetterSqlite3;

let db: BetterSqlite3.Database | null = null;

export function getConfigDir(): string {
  return path.join(process.env.HOME || '/tmp', '.config', 'Mailspring');
}

export function getDbPath(): string {
  return path.join(getConfigDir(), 'edgehill.db');
}

export function openDatabase(): boolean {
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) {
    log.warn(`Database not found at ${dbPath}`);
    return false;
  }
  try {
    db = new Database(dbPath, { readonly: true, timeout: 10000 });
    db.pragma('journal_mode = WAL');
    db.pragma('cache_size = 20000');
    log.info(`Database opened: ${dbPath}`);
    return true;
  } catch (err) {
    log.error('Failed to open database:', err);
    return false;
  }
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function reopenDatabase(): boolean {
  closeDatabase();
  inboxLabelIds = null; // clear cached inbox IDs
  return openDatabase();
}

export function isOpen(): boolean {
  return db !== null;
}

// ── Thread queries ──

interface ThreadRow {
  data: string;
  msgCount: number;
  senderData: string | null;
  bodyValue: string | null;
}

export interface DbThread {
  id: string;
  accountId: string;
  subject: string;
  snippet: string;
  participants: { name: string; email: string }[];
  lastMessageDate: number; // ms since epoch
  messageCount: number;
  unread: boolean;
  starred: boolean;
  labels: string[]; // label/folder roles
  categoryIds: string[];
  listUnsubscribe: string | null;
  senderEmail: string;
  emailType: EmailType;
  meta?: ThreadMeta;
}

/** Fast body scan for classification signals — avoids parsing full DOM.
 *  SQL already truncates to first 8KB + last 8KB so body is max ~16KB here. */
function extractBodyHints(body: string | null): BodyHints | null {
  if (!body || body.length < 50) return null;
  const lc = body.toLowerCase();

  const hasUnsubLink = /unsubscribe/i.test(lc) && /<a\b/i.test(lc);
  const hasTrackingPixel = /width=["']?1["']?\s+height=["']?1["']?/i.test(body)
    || /height=["']?1["']?\s+width=["']?1["']?/i.test(body)
    || /\.gif\?.*(?:u=|e=|id=)/i.test(body)
    || /open\.gif|pixel\.gif|track\.gif|beacon\./i.test(lc);
  const hasOrderTable = /order.{0,20}(?:total|summary|detail|confirm|number)/i.test(lc)
    || /(?:item|product|qty|quantity).{0,40}(?:price|amount|total)/i.test(lc);
  // Reply quote patterns — "On ... wrote:", "From:...Sent:...To:" (Outlook)
  const hasReplyQuotes = /on .{5,80} wrote:/i.test(lc)
    || /from:.*\bsent:.*\bto:/i.test(lc)
    || /------\s*original message/i.test(lc);

  // Count tags efficiently
  let imgCount = 0;
  let linkCount = 0;
  let idx = 0;
  while ((idx = lc.indexOf('<img', idx)) !== -1) { imgCount++; idx += 4; }
  idx = 0;
  while ((idx = lc.indexOf('<a ', idx)) !== -1) { linkCount++; idx += 3; }

  return {
    hasUnsubLink,
    hasTrackingPixel,
    hasOrderTable,
    hasReplyQuotes,
    imgCount,
    linkCount,
    bodyLength: body.length,
  };
}

function parseThread(row: ThreadRow): DbThread {
  const d = JSON.parse(row.data);
  // Extract sender from the most recent message's data if available
  let senderEmail = '';
  let listUnsubscribe: string | null = null;
  let latestMessageId: string | null = null;
  if (row.senderData) {
    try {
      const sd = JSON.parse(row.senderData);
      const from = (sd.from || [])[0];
      senderEmail = from?.email || '';
      listUnsubscribe = sd.hListUnsub || null;
      latestMessageId = sd.id || null;
    } catch { /* ignore */ }
  }
  if (!senderEmail && d.participants?.length) {
    senderEmail = d.participants[0]?.email || '';
  }

  const subject = d.subject || '(no subject)';
  const snippet = d.snippet || '';
  const bodyHints = extractBodyHints(row.bodyValue);
  const participantCount = (d.participants || []).length;
  const messageCount = row.msgCount || 0;
  const senderName = (d.participants || [])[0]?.name || '';

  // Priority 1: Manual thread override (highest priority)
  // Priority 2: Learned sender rule (from past user corrections)
  const manualType = getOverride(d.id) || getSenderRule(senderEmail);
  let emailType: EmailType;

  if (manualType) {
    emailType = manualType;
  } else {
    // Priority 2: Heuristic classification
    const classifyResult = classifyEmail({ senderEmail, subject, listUnsubscribe, bodyHints, participantCount, messageCount });
    emailType = classifyResult.type;

    // Priority 3: AI classification cache — only override when heuristic is low-confidence
    const msgId = latestMessageId || d.id;
    const aiType = getCachedType(msgId);
    if (aiType && classifyResult.lowConfidence) {
      emailType = aiType;
    } else if (classifyResult.lowConfidence && getAISettings().enabled) {
      queueForAIClassification({
        messageId: msgId,
        threadId: d.id,
        senderEmail,
        senderName,
        subject,
        snippet,
        heuristicGuess: classifyResult.type,
        hasListUnsubscribe: !!listUnsubscribe,
      });
    }
  }

  const meta = extractMeta(emailType, subject, snippet, senderName, senderEmail);

  return {
    id: d.id,
    accountId: d.aid || '',
    subject,
    snippet,
    participants: (d.participants || []).map((p: any) => ({
      name: p.name || p.email || '',
      email: p.email || '',
    })),
    lastMessageDate: (d.lmrt || 0) * 1000,
    messageCount: row.msgCount || 0,
    unread: !!d.unread,
    starred: !!d.starred,
    labels: [],
    categoryIds: [],
    listUnsubscribe,
    senderEmail,
    emailType,
    meta,
  };
}

/** Get inbox label IDs (cached per session) */
let inboxLabelIds: string[] | null = null;

function getInboxLabelIds(): string[] {
  if (inboxLabelIds) return inboxLabelIds;
  if (!db) return [];
  try {
    const ids: string[] = [];
    for (const table of ['Label', 'Folder']) {
      try {
        const rows = db.prepare(
          `SELECT id FROM ${table} WHERE json_extract(data, '$.role') = 'inbox'`
        ).all() as { id: string }[];
        for (const r of rows) ids.push(r.id);
      } catch { /* table might not exist */ }
    }
    inboxLabelIds = ids;
    log.info(`Inbox label IDs: ${ids.join(', ')}`);
    return ids;
  } catch {
    return [];
  }
}

export function getThreads(options: {
  accountId?: string;
  limit?: number;
  offset?: number;
  categoryId?: string;
  starred?: boolean;
  recipientEmail?: string;
}): DbThread[] {
  if (!db) return [];
  const { accountId, limit = 100, offset = 0, categoryId, starred, recipientEmail } = options;

  let sql: string;
  const params: any[] = [];

  // Common subqueries for classification signals
  // For bodyValue: fetch first 8KB + last 8KB to keep memory low while still detecting
  // unsubscribe links (usually in footer) and tracking pixels (usually in header/footer).
  const classifyColumns = `
        (SELECT COUNT(*) FROM Message m WHERE m.threadId = t.id) as msgCount,
        (SELECT m3.data FROM Message m3 WHERE m3.threadId = t.id ORDER BY m3.date DESC LIMIT 1) as senderData,
        (SELECT
          CASE
            WHEN LENGTH(mb.value) <= 16000 THEN mb.value
            ELSE SUBSTR(mb.value, 1, 8000) || SUBSTR(mb.value, -8000)
          END
         FROM Message m4 LEFT JOIN MessageBody mb ON mb.id = m4.id WHERE m4.threadId = t.id ORDER BY m4.date DESC LIMIT 1) as bodyValue`;

  if (categoryId) {
    sql = `
      SELECT t.data, ${classifyColumns}
      FROM Thread t
      INNER JOIN ThreadCategory tc ON tc.id = t.id
      WHERE tc.value = ? AND t.inAllMail = 1
    `;
    params.push(categoryId);
  } else {
    const inboxIds = getInboxLabelIds();
    if (inboxIds.length > 0) {
      const placeholders = inboxIds.map(() => '?').join(',');
      sql = `
        SELECT t.data, ${classifyColumns}
        FROM Thread t
        INNER JOIN ThreadCategory tc ON tc.id = t.id
        WHERE tc.value IN (${placeholders}) AND t.inAllMail = 1
      `;
      params.push(...inboxIds);
    } else {
      sql = `
        SELECT t.data, ${classifyColumns}
        FROM Thread t
        WHERE t.inAllMail = 1
      `;
    }
  }

  if (accountId) {
    sql += ' AND t.accountId = ?';
    params.push(accountId);
  }

  if (starred) {
    sql += ' AND t.starred = 1';
  }

  if (recipientEmail) {
    // Filter threads that have a message addressed to this email (To or CC)
    sql += ` AND EXISTS (
      SELECT 1 FROM Message m_alias
      WHERE m_alias.threadId = t.id
      AND (
        EXISTS (SELECT 1 FROM json_each(json_extract(m_alias.data, '$.to')) je WHERE LOWER(json_extract(je.value, '$.email')) = ?)
        OR EXISTS (SELECT 1 FROM json_each(json_extract(m_alias.data, '$.cc')) je WHERE LOWER(json_extract(je.value, '$.email')) = ?)
      )
    )`;
    const emailLower = recipientEmail.toLowerCase();
    params.push(emailLower, emailLower);
  }

  sql += ' ORDER BY t.lastMessageReceivedTimestamp DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  try {
    const rows = db.prepare(sql).all(...params) as ThreadRow[];
    const threads: DbThread[] = [];
    for (const row of rows) {
      try {
        threads.push(parseThread(row));
      } catch (e) {
        log.warn('parseThread skipped corrupt row:', e);
      }
    }
    const dist: Record<string, number> = {};
    for (const t of threads) { dist[t.emailType] = (dist[t.emailType] || 0) + 1; }
    log.info(`getThreads: ${rows.length} rows, types: ${JSON.stringify(dist)}`);
    return threads;
  } catch (err) {
    log.error('getThreads error:', err);
    return [];
  }
}

export function getThreadCount(accountId?: string): number {
  if (!db) return 0;
  try {
    let sql = 'SELECT COUNT(*) as cnt FROM Thread WHERE inAllMail = 1';
    const params: any[] = [];
    if (accountId) {
      sql += ' AND accountId = ?';
      params.push(accountId);
    }
    const row = db.prepare(sql).get(...params) as { cnt: number };
    return row?.cnt || 0;
  } catch {
    return 0;
  }
}

// ── Message queries ──

export interface DbAttachment {
  id: string;
  filename: string;
  size: number;
  contentType: string;
}

export interface DbMessage {
  id: string;
  accountId: string;
  threadId: string;
  headerMessageId: string;
  subject: string;
  snippet: string;
  from: { name: string; email: string };
  to: { name: string; email: string }[];
  cc: { name: string; email: string }[];
  date: number; // ms since epoch
  unread: boolean;
  starred: boolean;
  draft: boolean;
  body: string;
  hasAttachments: boolean;
  attachments: DbAttachment[];
  listUnsubscribe: string | null;
}

function parseContact(c: any): { name: string; email: string } {
  return { name: c?.name || c?.email || '', email: c?.email || '' };
}

/** Resolve cid: references in email body HTML to mailspring-file:// URLs */
function resolveInlineImages(body: string): string {
  if (!body.includes('cid:') || !db) return body;

  return body.replace(/cid:([^"'\s>]+)/gi, (match, cid) => {
    try {
      // Look up the File record by contentId (stored in JSON data blob)
      const row = db!.prepare(
        "SELECT data FROM File WHERE data LIKE ? LIMIT 1"
      ).get(`%"contentId":"${cid}"%`) as { data: string } | undefined;
      if (!row) return match;

      const f = JSON.parse(row.data);
      if (f.contentId !== cid) return match; // verify exact match

      const id = (f.id as string).toLowerCase();
      const filePath = `files/${id.slice(0, 2)}/${id.slice(2, 4)}/${id}/${encodeURIComponent(f.filename)}`;
      return `mailspring-file://local/${filePath}`;
    } catch {
      return match;
    }
  });
}

function parseMessage(row: { data: string; body?: string }): DbMessage {
  const d = JSON.parse(row.data);
  const from = (d.from || [])[0];
  const files: any[] = d.files || [];

  // Filter out inline images (those with contentId that render inside the body)
  const attachments: DbAttachment[] = files
    .filter((f: any) => !f.contentId)
    .map((f: any) => ({
      id: f.id,
      filename: f.filename || 'Untitled',
      size: f.size || 0,
      contentType: f.contentType || 'application/octet-stream',
    }));

  return {
    id: d.id,
    accountId: d.aid || '',
    threadId: d.threadId || '',
    headerMessageId: d.hMsgId || '',
    subject: d.subject || '',
    snippet: d.snippet || '',
    from: parseContact(from),
    to: (d.to || []).map(parseContact),
    cc: (d.cc || []).map(parseContact),
    date: (d.date || 0) * 1000,
    unread: !!d.unread,
    starred: !!d.starred,
    draft: !!d.draft,
    body: resolveInlineImages(row.body || ''),
    hasAttachments: files.length > 0,
    attachments,
    listUnsubscribe: d.hListUnsub || null,
  };
}

export function getMessages(threadId: string): DbMessage[] {
  if (!db) return [];
  try {
    const sql = `
      SELECT m.data, IFNULL(mb.value, '') as body
      FROM Message m
      LEFT OUTER JOIN MessageBody mb ON mb.id = m.id
      WHERE m.threadId = ?
      ORDER BY m.date ASC
    `;
    const rows = db.prepare(sql).all(threadId) as { data: string; body: string }[];
    const messages = rows.map(parseMessage);

    // Deduplicate: mailsync sometimes stores the same email twice — once with a real
    // headerMessageId and once with a synthetic @unknownmsgid. We use a content-based
    // fingerprint (date + sender + body prefix) so both copies produce the same key.
    const seen = new Set<string>();
    return messages.filter(m => {
      const bodyKey = (m.body || m.snippet || '').replace(/<[^>]*>/g, '').slice(0, 100);
      const key = `${m.date}_${m.from.email}_${bodyKey}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch (err) {
    log.error('getMessages error:', err);
    return [];
  }
}

export function getMessageBody(messageId: string): string {
  if (!db) return '';
  try {
    const row = db.prepare('SELECT value FROM MessageBody WHERE id = ?').get(messageId) as { value: string } | undefined;
    return resolveInlineImages(row?.value || '');
  } catch {
    return '';
  }
}

/** Resolve a File record ID to its absolute path on disk */
export function getFilePath(fileId: string): string | null {
  const id = fileId.toLowerCase();
  if (!db) return null;
  try {
    const row = db.prepare('SELECT data, filename FROM File WHERE id = ?').get(fileId) as { data: string; filename: string } | undefined;
    if (!row) return null;
    const f = JSON.parse(row.data);
    const filename = f.filename || row.filename || fileId;
    return path.join(getConfigDir(), 'files', id.slice(0, 2), id.slice(2, 4), id, filename);
  } catch {
    return null;
  }
}

// ── Category queries ──

export interface DbCategory {
  id: string;
  accountId: string;
  role: string;
  path: string;
}

export function getCategories(accountId?: string): DbCategory[] {
  if (!db) return [];
  try {
    const results: DbCategory[] = [];
    // Query both Label and Folder tables (Gmail uses labels, IMAP uses folders)
    for (const table of ['Label', 'Folder']) {
      let sql = `SELECT data FROM ${table}`;
      const params: any[] = [];
      if (accountId) {
        sql += ' WHERE accountId = ?';
        params.push(accountId);
      }
      try {
        const rows = db.prepare(sql).all(...params) as { data: string }[];
        for (const r of rows) {
          const d = JSON.parse(r.data);
          results.push({
            id: d.id,
            accountId: d.aid || '',
            role: d.role || '',
            path: d.path || '',
          });
        }
      } catch { /* table might not exist */ }
    }
    return results;
  } catch (err) {
    log.error('getCategories error:', err);
    return [];
  }
}

// ── Alias detection ──

/** Detect aliases by finding From addresses on sent messages.
 *  Gmail/IMAP marks sent messages with a \Sent label — From addresses
 *  on those messages are addresses the user actually sends from. */
export function detectAliases(accountId: string, primaryEmail: string): string[] {
  if (!db) return [];
  try {
    const primary = primaryEmail.toLowerCase();
    const rows = db.prepare(`
      SELECT DISTINCT LOWER(json_extract(je.value, '$.email')) as email
      FROM Message m, json_each(json_extract(m.data, '$.from')) je
      WHERE m.accountId = ?
        AND m.data LIKE '%\\Sent%'
        AND json_extract(m.data, '$.draft') = 0
    `).all(accountId) as { email: string }[];

    const aliases = rows
      .map(r => r.email)
      .filter(e => e && e !== primary);

    log.info(`[aliases] ${primaryEmail}: found ${aliases.length} aliases: ${aliases.join(', ')}`);
    return aliases.sort();
  } catch (err) {
    log.error('detectAliases error:', err);
    return [];
  }
}

// ── Contact search (for compose autocomplete) ──

export function searchContacts(query: string, accountId?: string, limit = 10): { name: string; email: string; refs: number }[] {
  if (!db || !query.trim()) return [];
  try {
    const q = query.trim().toLowerCase();
    let sql: string;
    const params: any[] = [];

    if (accountId) {
      sql = `
        SELECT json_extract(data, '$.name') as name, email, refs
        FROM Contact
        WHERE accountId = ?
          AND hidden = 0
          AND (LOWER(email) LIKE ? OR LOWER(json_extract(data, '$.name')) LIKE ?)
        ORDER BY refs DESC
        LIMIT ?
      `;
      params.push(accountId, `%${q}%`, `%${q}%`, limit);
    } else {
      sql = `
        SELECT json_extract(data, '$.name') as name, email, refs
        FROM Contact
        WHERE hidden = 0
          AND (LOWER(email) LIKE ? OR LOWER(json_extract(data, '$.name')) LIKE ?)
        ORDER BY refs DESC
        LIMIT ?
      `;
      params.push(`%${q}%`, `%${q}%`, limit);
    }

    const rows = db.prepare(sql).all(...params) as { name: string; email: string; refs: number }[];
    return rows.map(r => ({
      name: r.name || '',
      email: r.email || '',
      refs: r.refs || 0,
    }));
  } catch (err) {
    log.error('searchContacts error:', err);
    return [];
  }
}

// ── Account queries (from database, not config) ──

export function getAccountsFromDb(): { id: string; emailAddress: string; name: string; provider: string }[] {
  if (!db) return [];
  try {
    const rows = db.prepare('SELECT data FROM Account').all() as { data: string }[];
    return rows.map(r => {
      const d = JSON.parse(r.data);
      return {
        id: d.id,
        emailAddress: d.emailAddress || '',
        name: d.name || '',
        provider: d.provider || 'imap',
      };
    });
  } catch {
    return [];
  }
}
