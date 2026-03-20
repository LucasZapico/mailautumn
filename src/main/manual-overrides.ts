/**
 * Manual email type overrides — persisted JSON files.
 *
 * Two layers:
 * 1. Thread overrides  — per thread ID (exact match)
 * 2. Sender rules      — per sender email (learned when user reclassifies)
 *
 * When a user moves a thread to a different category, we store both:
 * - The thread override (so this specific thread always stays put)
 * - A sender rule (so future emails from that sender get the same type)
 *
 * Sender rules only apply to non-conversation types to avoid blocking
 * legitimate human senders who happen to share a domain with a brand.
 */

import fs from 'fs';
import path from 'path';
import log from 'electron-log/main';
import { getConfigDir } from './database';
import type { EmailType } from './classify-email';

// ── Thread overrides ──

interface OverrideEntry {
  type: EmailType;
  ts: number;
}

let overrides: Map<string, OverrideEntry> = new Map();
let overridesLoaded = false;

function overridesPath(): string {
  return path.join(getConfigDir(), 'type-overrides.json');
}

function loadOverrides(): void {
  if (overridesLoaded) return;
  overridesLoaded = true;
  try {
    const raw = fs.readFileSync(overridesPath(), 'utf-8');
    const entries = JSON.parse(raw) as Record<string, OverrideEntry>;
    overrides = new Map(Object.entries(entries));
    log.info(`[overrides] loaded ${overrides.size} thread overrides`);
  } catch {
    overrides = new Map();
  }
}

function saveOverrides(): void {
  try {
    const obj: Record<string, OverrideEntry> = {};
    for (const [k, v] of overrides) obj[k] = v;
    fs.writeFileSync(overridesPath(), JSON.stringify(obj), 'utf-8');
  } catch (err) {
    log.error('[overrides] failed to save thread overrides:', err);
  }
}

// ── Sender rules (learned from user corrections) ──

interface SenderRule {
  type: EmailType;
  ts: number;
  /** How many times the user has classified this sender as this type */
  count: number;
}

let senderRules: Map<string, SenderRule> = new Map();
let rulesLoaded = false;

function rulesPath(): string {
  return path.join(getConfigDir(), 'sender-rules.json');
}

function loadRules(): void {
  if (rulesLoaded) return;
  rulesLoaded = true;
  try {
    const raw = fs.readFileSync(rulesPath(), 'utf-8');
    const entries = JSON.parse(raw) as Record<string, SenderRule>;
    senderRules = new Map(Object.entries(entries));
    log.info(`[overrides] loaded ${senderRules.size} sender rules`);
  } catch {
    senderRules = new Map();
  }
}

function saveRules(): void {
  try {
    const obj: Record<string, SenderRule> = {};
    for (const [k, v] of senderRules) obj[k] = v;
    fs.writeFileSync(rulesPath(), JSON.stringify(obj), 'utf-8');
  } catch (err) {
    log.error('[overrides] failed to save sender rules:', err);
  }
}

// ── Public API ──

/** Check for a thread-level override (exact thread ID match) */
export function getOverride(threadId: string): EmailType | null {
  loadOverrides();
  return overrides.get(threadId)?.type ?? null;
}

/** Check for a learned sender rule (exact email first, then domain) */
export function getSenderRule(senderEmail: string): EmailType | null {
  loadRules();
  const email = senderEmail.toLowerCase();
  // Exact sender match
  const exact = senderRules.get(email);
  if (exact) return exact.type;
  // Domain match (stored as @domain.com)
  const domain = '@' + (email.split('@')[1] || '');
  const domainRule = senderRules.get(domain);
  if (domainRule) return domainRule.type;
  return null;
}

/**
 * Set a manual override for a thread AND learn a sender rule.
 * Pass senderEmail so we can learn from the correction.
 */
export function setOverride(threadId: string, type: EmailType, senderEmail?: string): void {
  loadOverrides();
  overrides.set(threadId, { type, ts: Date.now() });
  saveOverrides();
  log.info(`[overrides] thread ${threadId} → ${type}`);

  // Learn sender rule — skip for:
  // - 'conversation' type (don't block human senders)
  // - the user's own addresses (the senderEmail comes from the last message,
  //   which is often the user's own reply — we'd accidentally learn
  //   "lucas@company.com = newsletter" and break everything)
  if (senderEmail && type !== 'conversation') {
    const key = senderEmail.toLowerCase();
    // Check if this is one of the user's own addresses
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getAllAccountsForSync } = require('./accounts');
    const ownEmails = new Set<string>();
    try {
      for (const acct of getAllAccountsForSync()) {
        ownEmails.add(acct.emailAddress.toLowerCase());
        for (const alias of acct.settings?.aliases || []) {
          ownEmails.add(alias.toLowerCase());
        }
      }
    } catch { /* ignore */ }

    if (!ownEmails.has(key)) {
      loadRules();
      const existing = senderRules.get(key);
      if (existing && existing.type === type) {
        existing.count += 1;
        existing.ts = Date.now();
      } else {
        senderRules.set(key, { type, ts: Date.now(), count: 1 });
      }

      // Auto-promote to domain rule after 2+ senders from the same domain
      // classified as the same type (e.g., 2 Google Search Console emails → Updates)
      const domain = '@' + (key.split('@')[1] || '');
      if (domain.length > 1 && !senderRules.has(domain)) {
        let domainCount = 0;
        for (const [ruleKey, rule] of senderRules) {
          if (ruleKey.endsWith(domain) && !ruleKey.startsWith('@') && rule.type === type) {
            domainCount++;
          }
        }
        if (domainCount >= 2) {
          senderRules.set(domain, { type, ts: Date.now(), count: domainCount });
          log.info(`[overrides] auto domain rule: ${domain} → ${type} (${domainCount} senders)`);
        }
      }

      saveRules();
      log.info(`[overrides] sender rule: ${senderEmail} → ${type} (count: ${senderRules.get(key)!.count})`);
    }
  }
}

/** Set a domain-level rule (e.g., @google.com → notification) */
export function setDomainRule(domain: string, type: EmailType): void {
  loadRules();
  const key = domain.startsWith('@') ? domain.toLowerCase() : `@${domain.toLowerCase()}`;
  senderRules.set(key, { type, ts: Date.now(), count: 1 });
  saveRules();
  log.info(`[overrides] domain rule: ${key} → ${type}`);
}

/** Get all sender/domain rules for the settings UI */
export function getAllSenderRules(): { rules: { key: string; type: string; count: number }[]; overrideCount: number } {
  loadRules();
  loadOverrides();
  const rules = [...senderRules.entries()].map(([key, rule]) => ({
    key,
    type: rule.type,
    count: rule.count,
  }));
  // Sort: domain rules first, then by key
  rules.sort((a, b) => {
    if (a.key.startsWith('@') !== b.key.startsWith('@')) return a.key.startsWith('@') ? -1 : 1;
    return a.key.localeCompare(b.key);
  });
  return { rules, overrideCount: overrides.size };
}

/** Remove a sender or domain rule */
export function removeSenderRule(key: string): void {
  loadRules();
  if (senderRules.delete(key.toLowerCase())) {
    saveRules();
    log.info(`[overrides] removed sender rule: ${key}`);
  }
}

/** Clear all thread-level overrides */
export function clearAllOverrides(): void {
  loadOverrides();
  overrides.clear();
  saveOverrides();
  log.info('[overrides] cleared all thread overrides');
}

export function removeOverride(threadId: string): void {
  loadOverrides();
  if (overrides.delete(threadId)) {
    saveOverrides();
    log.info(`[overrides] removed override for thread ${threadId}`);
  }
}
