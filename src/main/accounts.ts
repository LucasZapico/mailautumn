import { app, safeStorage } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import log from 'electron-log/main';
import { getConfigDir } from './database';
import { getGmailClientId, getGmailClientSecret } from './oauth';
import type { AccountForSync } from './mailsync';

interface StoredAccount {
  id: string;
  name: string;
  provider: string;
  emailAddress: string;
  settings: Record<string, any>;
  avatarUrl?: string | null;
}

interface AppConfig {
  accounts: StoredAccount[];
  accountsVersion: number;
}

function configPath(): string {
  return path.join(getConfigDir(), 'mailspring-next-config.json');
}

function credentialsPath(): string {
  return path.join(getConfigDir(), 'credentials.enc');
}

// ── Config persistence ──

function loadConfig(): AppConfig {
  try {
    const raw = fs.readFileSync(configPath(), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { accounts: [], accountsVersion: 0 };
  }
}

function saveConfig(config: AppConfig): void {
  const dir = getConfigDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf-8');
}

// ── Credential management (encrypted with safeStorage) ──

type KeyHash = Record<string, string>;

// Previous app names — used to migrate credentials encrypted under old names.
const LEGACY_APP_NAMES = ['mailspring-next', 'mailautom'];

function loadCredentials(): KeyHash {
  const p = credentialsPath();
  try {
    if (!fs.existsSync(p)) {
      log.warn(`[credentials] file not found: ${p}`);
      return {};
    }
    const raw = fs.readFileSync(p);
    if (!safeStorage.isEncryptionAvailable()) {
      log.warn('[credentials] safeStorage encryption not available, reading as plaintext');
      return JSON.parse(raw.toString('utf-8'));
    }

    // Try decrypting with current app name first
    try {
      const decrypted = safeStorage.decryptString(raw);
      return JSON.parse(decrypted);
    } catch {
      // Current app name didn't work — try legacy names
    }

    // Try legacy app names — the file may have been encrypted under a previous name
    const currentName = app.getName();
    for (const legacyName of LEGACY_APP_NAMES) {
      if (legacyName === currentName) continue;
      try {
        app.setName(legacyName);
        const decrypted = safeStorage.decryptString(raw);
        const keys = JSON.parse(decrypted);
        log.info(`[credentials] migrated from legacy app name "${legacyName}"`);
        app.setName(currentName);
        // Re-encrypt under current name so this migration only happens once
        saveCredentials(keys);
        return keys;
      } catch {
        // This legacy name didn't work either
      }
    }
    app.setName(currentName);
    log.error('[credentials] could not decrypt with any known app name');
    return {};
  } catch (err: any) {
    log.error(`[credentials] failed to load: ${err.message}`);
    return {};
  }
}

function saveCredentials(keys: KeyHash): void {
  const dir = getConfigDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const json = JSON.stringify(keys);
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(json);
    fs.writeFileSync(credentialsPath(), encrypted);
  } else {
    log.warn('safeStorage encryption not available, storing as plaintext');
    fs.writeFileSync(credentialsPath(), json, 'utf-8');
  }
}

// ── Public API ──

export function getAccounts(): StoredAccount[] {
  return loadConfig().accounts;
}

export function getAccountForSync(accountId: string): AccountForSync | null {
  const config = loadConfig();
  const account = config.accounts.find(a => a.id === accountId);
  if (!account) return null;
  return injectSecrets(account);
}

export function getAllAccountsForSync(): AccountForSync[] {
  const config = loadConfig();
  return config.accounts.map(injectSecrets);
}

function injectSecrets(account: StoredAccount): AccountForSync {
  const keys = loadCredentials();
  return {
    ...account,
    settings: {
      ...account.settings,
      imap_password: keys[`${account.emailAddress}-imap`] || '',
      smtp_password: keys[`${account.emailAddress}-smtp`] || '',
      refresh_token: keys[`${account.emailAddress}-refresh-token`] || '',
    },
  };
}

export function addAccount(account: {
  name: string;
  emailAddress: string;
  provider: string;
  settings: Record<string, any>;
  refreshToken?: string;
  avatarUrl?: string | null;
}): AccountForSync {
  // Generate account ID the same way original Mailspring does: 8-char hex hash
  const idString = `${account.emailAddress}${JSON.stringify({
    imap_username: account.settings.imap_username,
    imap_host: account.settings.imap_host,
    smtp_username: account.settings.smtp_username,
    smtp_host: account.settings.smtp_host,
  })}`;
  const id = crypto.createHash('sha256').update(idString, 'utf8').digest('hex').substring(0, 8);

  // Store secrets separately
  const keys = loadCredentials();
  if (account.settings.imap_password) {
    keys[`${account.emailAddress}-imap`] = account.settings.imap_password;
  }
  if (account.settings.smtp_password) {
    keys[`${account.emailAddress}-smtp`] = account.settings.smtp_password;
  }
  if (account.refreshToken) {
    keys[`${account.emailAddress}-refresh-token`] = account.refreshToken;
  }
  saveCredentials(keys);

  // Store account without secrets
  const { imap_password, smtp_password, ...publicSettings } = account.settings;
  const storedAccount: StoredAccount = {
    id,
    name: account.name,
    provider: account.provider,
    emailAddress: account.emailAddress,
    settings: publicSettings,
    avatarUrl: account.avatarUrl || null,
  };

  const config = loadConfig();
  config.accounts.push(storedAccount);
  config.accountsVersion += 1;
  saveConfig(config);

  log.info(`Account added: ${account.emailAddress} (${id})`);

  // Return full account with secrets for sync
  return injectSecrets(storedAccount);
}

export function removeAccount(accountId: string): void {
  const config = loadConfig();
  const account = config.accounts.find(a => a.id === accountId);
  if (!account) return;

  // Remove credentials
  const keys = loadCredentials();
  delete keys[`${account.emailAddress}-imap`];
  delete keys[`${account.emailAddress}-smtp`];
  delete keys[`${account.emailAddress}-refresh-token`];
  saveCredentials(keys);

  // Remove from config
  config.accounts = config.accounts.filter(a => a.id !== accountId);
  config.accountsVersion += 1;
  saveConfig(config);

  log.info(`Account removed: ${account.emailAddress} (${accountId})`);
}

// ── Avatar refresh for existing accounts ──

function updateAccountAvatar(accountId: string, avatarUrl: string): void {
  const config = loadConfig();
  const account = config.accounts.find(a => a.id === accountId);
  if (!account) return;
  account.avatarUrl = avatarUrl;
  saveConfig(config);
}

async function fetchGmailAvatar(email: string): Promise<string | null> {
  const keys = loadCredentials();
  const refreshToken = keys[`${email}-refresh-token`];
  if (!refreshToken) return null;

  // Exchange refresh token for access token
  const resp = await fetch('https://www.googleapis.com/oauth2/v4/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: getGmailClientId(),
      client_secret: getGmailClientSecret(),
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!resp.ok) return null;
  const { access_token } = await resp.json();

  // Fetch profile
  const profileResp = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!profileResp.ok) return null;
  const data = await profileResp.json();
  return data.picture || null;
}

/** Fetch and store profile pictures for accounts missing avatarUrl. Returns true if any were updated. */
export async function refreshMissingAvatars(): Promise<boolean> {
  const config = loadConfig();
  let updated = false;
  for (const account of config.accounts) {
    if (account.avatarUrl) continue;

    try {
      let url: string | null = null;
      if (account.provider === 'gmail') {
        url = await fetchGmailAvatar(account.emailAddress);
      }
      // O365 avatar refresh not yet implemented — requires Graph API token refresh

      if (url) {
        updateAccountAvatar(account.id, url);
        log.info(`[avatar] fetched profile picture for ${account.emailAddress}`);
        updated = true;
      } else {
        log.info(`[avatar] no profile picture for ${account.emailAddress}`);
      }
    } catch (err) {
      log.warn(`[avatar] failed to fetch for ${account.emailAddress}:`, err);
    }
  }
  return updated;
}
