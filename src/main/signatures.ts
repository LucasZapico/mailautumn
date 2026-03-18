/**
 * Email signature storage — one signature per email address/alias.
 * Stored as HTML in a JSON file.
 */

import fs from 'fs';
import path from 'path';
import log from 'electron-log/main';
import { getConfigDir } from './database';

interface SignatureStore {
  [email: string]: string; // email → HTML signature
}

let store: SignatureStore = {};
let loaded = false;

function filePath(): string {
  return path.join(getConfigDir(), 'signatures.json');
}

function load(): void {
  if (loaded) return;
  loaded = true;
  try {
    const raw = fs.readFileSync(filePath(), 'utf-8');
    store = JSON.parse(raw);
    log.info(`[signatures] loaded ${Object.keys(store).length} signatures`);
  } catch {
    store = {};
  }
}

function save(): void {
  try {
    const dir = getConfigDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath(), JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    log.error('[signatures] failed to save:', err);
  }
}

export function getSignature(email: string): string {
  load();
  return store[email.toLowerCase()] || '';
}

export function setSignature(email: string, html: string): void {
  load();
  const key = email.toLowerCase();
  if (html.trim()) {
    store[key] = html;
  } else {
    delete store[key];
  }
  save();
}

export function getAllSignatures(): SignatureStore {
  load();
  return { ...store };
}
