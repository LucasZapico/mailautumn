/**
 * AI-powered thread analysis — runs in main process.
 * Analyzes conversation threads to extract summaries, action items,
 * key dates, and topics. Results are cached per thread + message count.
 */

import fs from 'fs';
import path from 'path';
import log from 'electron-log/main';
import { getConfigDir } from './database';
import { callAI } from './ai-api';
import type { AISettings } from './ai-api';

// ── Types ──

export interface ThreadAnalysis {
  summary: string;
  actionItems: string[];
  keyDates: { date: string; description: string }[];
  topics: string[];
  participants: { name: string; role: string }[];
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
}

interface CacheEntry {
  analysis: ThreadAnalysis;
  messageCount: number;
  ts: number;
}

// ── System Prompt ──

const SYSTEM_PROMPT = `You are an email thread analyst. Given a conversation thread, analyze it and return a JSON object with these fields:

{
  "summary": "1-2 sentence overview of the conversation — what it's about and where it stands",
  "actionItems": ["list of specific next steps, commitments, or follow-ups mentioned"],
  "keyDates": [{"date": "the date mentioned", "description": "what's happening"}],
  "topics": ["2-4 topic tags like: meeting, sales, onboarding, networking, scheduling"],
  "participants": [{"name": "person name", "role": "brief role like: prospect, colleague, vendor"}],
  "sentiment": "positive | neutral | negative | mixed"
}

Rules:
- Be concise. Summary should be 1-2 sentences max.
- Action items should be specific and actionable, not vague.
- Only include dates that are explicitly mentioned.
- Topics should be lowercase, short tags.
- Return ONLY valid JSON, nothing else.`;

// ── Cache ──

let cache: Map<string, CacheEntry> = new Map();
let cacheLoaded = false;

function cachePath(): string {
  return path.join(getConfigDir(), 'ai-thread-cache.json');
}

function loadCache(): void {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try {
    const raw = fs.readFileSync(cachePath(), 'utf-8');
    const entries = JSON.parse(raw) as Record<string, CacheEntry>;
    cache = new Map(Object.entries(entries));
    log.info(`[ai-thread] loaded ${cache.size} cached analyses`);
  } catch {
    cache = new Map();
  }
}

function saveCache(): void {
  try {
    const obj: Record<string, CacheEntry> = {};
    // Keep max 2000 entries (LRU by timestamp)
    const entries = [...cache.entries()].sort((a, b) => b[1].ts - a[1].ts).slice(0, 2000);
    for (const [k, v] of entries) obj[k] = v;
    fs.writeFileSync(cachePath(), JSON.stringify(obj), 'utf-8');
  } catch (err) {
    log.error('[ai-thread] failed to save cache:', err);
  }
}

// ── Public API ──

/** Get cached analysis if available and still valid (same message count) */
export function getCachedAnalysis(threadId: string, messageCount: number): ThreadAnalysis | null {
  loadCache();
  const entry = cache.get(threadId);
  if (entry && entry.messageCount === messageCount) return entry.analysis;
  return null;
}

/** Analyze a thread — returns cached result or calls AI */
export async function analyzeThread(
  threadId: string,
  messages: { from: string; date: string; snippet: string }[],
  aiSettings: AISettings,
): Promise<{ analysis: ThreadAnalysis } | { error: string } | null> {
  if (!aiSettings.enabled || !aiSettings.endpoint || !aiSettings.apiKey) {
    return { error: 'AI is not configured. Enable it in Settings \u2192 AI.' };
  }

  // Check cache
  loadCache();
  const cached = cache.get(threadId);
  if (cached && cached.messageCount === messages.length) return { analysis: cached.analysis };

  try {
    const userPrompt = buildPrompt(messages);
    const response = await callAI({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      settings: aiSettings,
      maxTokens: 600,
      temperature: 0,
      tag: 'ai-thread',
    });

    const analysis = parseResponse(response);
    if (analysis) {
      cache.set(threadId, { analysis, messageCount: messages.length, ts: Date.now() });
      saveCache();
      log.info(`[ai-thread] analyzed ${threadId}: ${analysis.summary.slice(0, 80)}...`);
      return { analysis };
    }

    log.warn(`[ai-thread] failed to parse response for ${threadId}`);
    return { error: 'AI returned an unparseable response. Try again.' };
  } catch (err: any) {
    log.error(`[ai-thread] analysis failed for ${threadId}:`, err);
    return { error: err?.message || 'AI analysis failed unexpectedly.' };
  }
}

// ── Helpers ──

function buildPrompt(messages: { from: string; date: string; snippet: string }[]): string {
  const thread = messages.map((m, i) =>
    `[${i + 1}] From: ${m.from} | ${m.date}\n${m.snippet}`
  ).join('\n\n');

  return `Analyze this email thread:\n\n${thread}`;
}

function parseResponse(text: string): ThreadAnalysis | null {
  try {
    // Extract JSON from response (may have markdown fences)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems.filter((s: unknown) => typeof s === 'string') : [],
      keyDates: Array.isArray(parsed.keyDates)
        ? parsed.keyDates
            .filter((d: any) => d && typeof d.date === 'string')
            .map((d: any) => ({ date: d.date, description: d.description || '' }))
        : [],
      topics: Array.isArray(parsed.topics) ? parsed.topics.filter((s: unknown) => typeof s === 'string') : [],
      participants: Array.isArray(parsed.participants)
        ? parsed.participants
            .filter((p: any) => p && typeof p.name === 'string')
            .map((p: any) => ({ name: p.name, role: p.role || '' }))
        : [],
      sentiment: ['positive', 'neutral', 'negative', 'mixed'].includes(parsed.sentiment)
        ? parsed.sentiment
        : 'neutral',
    };
  } catch {
    return null;
  }
}
