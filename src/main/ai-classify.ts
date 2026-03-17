/**
 * AI-powered email classification — runs in main process.
 * Calls out to OpenAI-compatible or Anthropic APIs to classify emails
 * that the heuristic classifier can't confidently sort.
 *
 * Results are cached permanently so each email is only classified once.
 */

import fs from 'fs';
import path from 'path';
import log from 'electron-log/main';
import { BrowserWindow } from 'electron';
import { getConfigDir } from './database';
import { callAI } from './ai-api';
import type { AISettings } from './ai-api';
import type { EmailType } from './classify-email';

// Re-export types that other modules depend on
export type { AISettings } from './ai-api';
export type { AIProvider } from './ai-api';

interface CacheEntry {
  type: EmailType;
  ts: number;
}

const VALID_TYPES = new Set<EmailType>([
  'conversation', 'newsletter', 'notification', 'transactional', 'marketing', 'calendar',
]);

// ── Cache (persistent JSON file) ──

let cache: Map<string, CacheEntry> = new Map();
let cacheLoaded = false;

function cachePath(): string {
  return path.join(getConfigDir(), 'ai-classifications.json');
}

function loadCache(): void {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try {
    const raw = fs.readFileSync(cachePath(), 'utf-8');
    const entries = JSON.parse(raw) as Record<string, CacheEntry>;
    cache = new Map(Object.entries(entries));
    log.info(`[ai-classify] loaded ${cache.size} cached classifications`);
  } catch {
    cache = new Map();
  }
}

function saveCache(): void {
  try {
    const obj: Record<string, CacheEntry> = {};
    // Keep max 5000 entries (LRU by timestamp)
    const entries = [...cache.entries()].sort((a, b) => b[1].ts - a[1].ts).slice(0, 5000);
    for (const [k, v] of entries) obj[k] = v;
    fs.writeFileSync(cachePath(), JSON.stringify(obj), 'utf-8');
  } catch (err) {
    log.error('[ai-classify] failed to save cache:', err);
  }
}

export function getCachedType(messageId: string): EmailType | null {
  loadCache();
  return cache.get(messageId)?.type ?? null;
}

// ── Settings ──

let settings: AISettings = {
  enabled: false,
  provider: 'openai',
  endpoint: '',
  apiKey: '',
  model: '',
};

function settingsPath(): string {
  return path.join(getConfigDir(), 'ai-settings.json');
}

export function loadAISettings(): AISettings {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf-8');
    const saved = JSON.parse(raw);
    settings = { ...settings, ...saved };
  } catch { /* use defaults */ }
  return settings;
}

export function saveAISettings(s: AISettings): void {
  settings = s;
  try {
    const dir = getConfigDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2), 'utf-8');
    log.info(`[ai-classify] settings saved: ${s.provider} ${s.enabled ? 'enabled' : 'disabled'}`);
  } catch (err) {
    log.error('[ai-classify] failed to save settings:', err);
  }
}

export function getAISettings(): AISettings {
  return { ...settings };
}

// ── Queue & Processing ──

interface ClassifyRequest {
  messageId: string;
  threadId: string;
  senderEmail: string;
  senderName: string;
  subject: string;
  snippet: string;
  /** The heuristic's low-confidence guess, so the AI can confirm or override */
  heuristicGuess?: EmailType;
  /** Whether the email has a List-Unsubscribe header */
  hasListUnsubscribe?: boolean;
}

const queue: ClassifyRequest[] = [];
let processing = false;
let savePending = false;

export function queueForAIClassification(req: ClassifyRequest): void {
  if (!settings.enabled || !settings.endpoint || !settings.apiKey) return;
  loadCache();
  if (cache.has(req.messageId)) return;
  if (queue.some(q => q.messageId === req.messageId)) return;
  queue.push(req);
  processQueue();
}

async function processQueue(): Promise<void> {
  if (processing || queue.length === 0) return;
  processing = true;

  while (queue.length > 0) {
    const batch = queue.splice(0, 10);
    try {
      const results = await classifyBatch(batch);
      for (const [messageId, type] of results) {
        cache.set(messageId, { type, ts: Date.now() });
      }
      savePending = true;

      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('ai:classifications-updated');
      }
    } catch (err) {
      log.error('[ai-classify] batch failed:', err);
      break;
    }
  }

  if (savePending) {
    saveCache();
    savePending = false;
  }
  processing = false;
}

// ── Classification ──

const CLASSIFY_PROMPT = `You are an email classifier. For each email, respond with ONLY the type — one of: conversation, newsletter, notification, transactional, marketing, calendar.

Definitions:
- conversation: Human-to-human email, personal or business correspondence. Must involve real people writing to each other.
- newsletter: Recurring content from publishers, blogs, digests, mailing lists. Sent from brands, companies, or content platforms to subscribers. Includes product updates, changelogs, community roundups.
- notification: Alerts from apps/services (GitHub, Slack, Google, etc.), security alerts, account notifications, login alerts, mentions, comments.
- transactional: Receipts, orders, shipping, payments, subscriptions, invoices, verification codes, booking confirmations.
- marketing: Promotional emails, sales, discounts, offers, product launches.
- calendar: Meeting invitations, calendar events, RSVPs.

Key signals:
- Bulk sender subdomains like @email.company.com, @mail.company.com, @news.company.com are almost always newsletter or marketing.
- List-Unsubscribe header present = very unlikely to be a conversation.
- noreply@, no-reply@, donotreply@ senders = never a conversation.
- Brand-style local parts (yo@, drink@, vip@, care@, hello@, team@) = likely newsletter or marketing.
- A "conversation" MUST have a real human sender with a personal or business email address.

Each email includes a "Heuristic guess" — our rule-based classifier's best guess. Confirm it if it looks right, or override it if the signals clearly point elsewhere.

Respond with one type per line, in the same order as the emails. Nothing else.`;

function buildUserPrompt(batch: ClassifyRequest[]): string {
  return batch.map((r, i) => {
    const lines = [
      `${i + 1}. From: ${r.senderName} <${r.senderEmail}>`,
      `   Subject: ${r.subject}`,
      `   Preview: ${r.snippet.slice(0, 300)}`,
    ];
    if (r.hasListUnsubscribe) lines.push(`   List-Unsubscribe: yes`);
    if (r.heuristicGuess) lines.push(`   Heuristic guess: ${r.heuristicGuess}`);
    return lines.join('\n');
  }).join('\n\n');
}

async function classifyBatch(batch: ClassifyRequest[]): Promise<Map<string, EmailType>> {
  const results = new Map<string, EmailType>();
  const userPrompt = buildUserPrompt(batch);

  const responseText = await callAI({
    systemPrompt: CLASSIFY_PROMPT,
    userPrompt,
    settings,
    maxTokens: 200,
    temperature: 0,
    tag: 'ai-classify',
  });

  const lines = responseText.trim().split('\n').map(l => l.trim().toLowerCase());
  for (let i = 0; i < batch.length; i++) {
    let type = lines[i]?.replace(/^\d+[\.\)]\s*/, '').trim() as EmailType;
    if (!VALID_TYPES.has(type)) {
      for (const t of VALID_TYPES) {
        if (lines[i]?.includes(t)) { type = t; break; }
      }
    }
    if (VALID_TYPES.has(type)) {
      results.set(batch[i].messageId, type);
      log.info(`[ai-classify] ${batch[i].senderEmail}: "${batch[i].subject}" → ${type}`);
    } else {
      log.warn(`[ai-classify] unparseable response for "${batch[i].subject}": ${lines[i]}`);
    }
  }

  return results;
}

// ── Test connection ──

export async function testAIConnection(s: AISettings): Promise<{ success: boolean; error?: string }> {
  const prev = { ...settings };
  settings = s;
  try {
    const batch: ClassifyRequest[] = [{
      messageId: 'test',
      threadId: 'test',
      senderEmail: 'newsletter@example.com',
      senderName: 'Example Newsletter',
      subject: 'Weekly Digest: Top Stories',
      snippet: 'Here are this week\'s top stories curated just for you.',
    }];
    const results = await classifyBatch(batch);
    const type = results.get('test');
    if (type) {
      return { success: true };
    }
    return { success: false, error: 'No classification returned' };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    settings = prev;
  }
}
