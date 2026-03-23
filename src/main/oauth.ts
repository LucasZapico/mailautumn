import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import crypto from 'crypto';
import log from 'electron-log/main';

const LOCAL_SERVER_PORT = 12141;

// ── Gmail OAuth ──

// OAuth credentials — read at call time (not import time) so .env loader
// in index.ts has a chance to populate process.env first.
// Create your own at https://console.cloud.google.com/ (Gmail)
// or https://portal.azure.com/ (Outlook). See README for details.
export function getGmailClientId(): string { return process.env.MS_GMAIL_CLIENT_ID || ''; }
export function getGmailClientSecret(): string { return process.env.MS_GMAIL_CLIENT_SECRET || ''; }

const GMAIL_SCOPES = [
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/contacts',
  'https://www.googleapis.com/auth/calendar',
];

// ── O365 OAuth ──

function getO365ClientId(): string { return process.env.MS_getO365ClientId() || ''; }

const O365_SCOPES = [
  'user.read',
  'offline_access',
  'Contacts.ReadWrite',
  'Contacts.ReadWrite.Shared',
  'Calendars.ReadWrite',
  'Calendars.ReadWrite.Shared',
  'https://outlook.office.com/IMAP.AccessAsUser.All',
  'https://outlook.office.com/SMTP.Send',
];

// PKCE
let codeVerifier = '';

function generateCodeChallenge(verifier: string): string {
  return crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ── Auth URL builders ──

function gmailAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: getGmailClientId(),
    redirect_uri: `http://127.0.0.1:${LOCAL_SERVER_PORT}`,
    response_type: 'code',
    scope: GMAIL_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'select_account consent',
  });
  return `https://accounts.google.com/o/oauth2/auth?${params}`;
}

function o365AuthUrl(): string {
  codeVerifier = crypto.randomUUID() + crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: getO365ClientId(),
    redirect_uri: `http://localhost:${LOCAL_SERVER_PORT}/desktop`,
    response_type: 'code',
    scope: O365_SCOPES.join(' '),
    response_mode: 'query',
    code_challenge: generateCodeChallenge(codeVerifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
}

// ── Token exchange ──

interface TokenResponse {
  access_token: string;
  refresh_token: string;
}

async function exchangeGmailCode(code: string): Promise<TokenResponse> {
  const resp = await fetch('https://www.googleapis.com/oauth2/v4/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: getGmailClientId(),
      client_secret: getGmailClientSecret(),
      redirect_uri: `http://127.0.0.1:${LOCAL_SERVER_PORT}`,
      grant_type: 'authorization_code',
    }),
  });
  if (!resp.ok) throw new Error(`Gmail token exchange failed: ${await resp.text()}`);
  return resp.json();
}

async function exchangeO365Code(code: string): Promise<TokenResponse> {
  const tokenScopes = O365_SCOPES.filter((s) => !s.includes('outlook.office.com'));
  const resp = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      scope: tokenScopes.join(' '),
      client_id: getO365ClientId(),
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: `http://localhost:${LOCAL_SERVER_PORT}/desktop`,
    }),
  });
  if (!resp.ok) throw new Error(`O365 token exchange failed: ${await resp.text()}`);
  return resp.json();
}

// ── User profile ──

interface UserProfile {
  name: string;
  email: string;
  picture: string | null;
}

async function gmailProfile(accessToken: string): Promise<UserProfile> {
  const resp = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await resp.json();
  return { name: data.name || data.email, email: data.email, picture: data.picture || null };
}

async function o365Profile(accessToken: string): Promise<UserProfile> {
  const resp = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await resp.json();
  // Try to fetch profile photo as base64
  let picture: string | null = null;
  try {
    const photoResp = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (photoResp.ok) {
      const buf = Buffer.from(await photoResp.arrayBuffer());
      const contentType = photoResp.headers.get('content-type') || 'image/jpeg';
      picture = `data:${contentType};base64,${buf.toString('base64')}`;
    }
  } catch { /* no photo available */ }
  return { name: data.displayName || data.userPrincipalName, email: data.mail || data.userPrincipalName, picture };
}

// ── Public types ──

export interface OAuthResult {
  name: string;
  emailAddress: string;
  provider: string;
  refreshToken: string;
  settings: Record<string, any>;
  avatarUrl: string | null;
}

// ── OAuth flow (two-step: begin returns URL, await waits for callback) ──

let activeServer: Server | null = null;
let pendingResult: Promise<OAuthResult> | null = null;

function closeServer(): void {
  if (activeServer) {
    activeServer.close();
    activeServer = null;
  }
}

/** Start the callback server and return the auth URL. Does NOT open browser. */
export function beginOAuth(provider: 'gmail' | 'outlook'): Promise<string> {
  closeServer();
  pendingResult = null;

  const authUrl = provider === 'gmail' ? gmailAuthUrl() : o365AuthUrl();

  pendingResult = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      closeServer();
      reject(new Error('OAuth timed out after 5 minutes'));
    }, 5 * 60 * 1000);

    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || '/', `http://127.0.0.1:${LOCAL_SERVER_PORT}`);
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><h2>Authentication failed</h2><p>You can close this window.</p></body></html>');
        clearTimeout(timeout);
        closeServer();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (!code) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><p>Waiting for authentication...</p></body></html>');
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><h2>Authentication successful!</h2><p>You can close this window and return to Mailautumn.</p></body></html>');

      try {
        let tokens: TokenResponse;
        let profile: UserProfile;
        let result: OAuthResult;

        if (provider === 'gmail') {
          tokens = await exchangeGmailCode(code);
          profile = await gmailProfile(tokens.access_token);
          result = {
            name: profile.name,
            emailAddress: profile.email,
            provider: 'gmail',
            refreshToken: tokens.refresh_token,
            avatarUrl: profile.picture,
            settings: {
              imap_host: 'imap.gmail.com',
              imap_port: 993,
              imap_username: profile.email,
              imap_security: 'SSL / TLS',
              imap_allow_insecure_ssl: false,
              smtp_host: 'smtp.gmail.com',
              smtp_port: 465,
              smtp_username: profile.email,
              smtp_security: 'SSL / TLS',
              smtp_allow_insecure_ssl: false,
              refresh_client_id: getGmailClientId(),
            },
          };
        } else {
          tokens = await exchangeO365Code(code);
          profile = await o365Profile(tokens.access_token);
          result = {
            name: profile.name,
            emailAddress: profile.email,
            provider: 'office365',
            refreshToken: tokens.refresh_token,
            avatarUrl: profile.picture,
            settings: {
              imap_host: 'outlook.office365.com',
              imap_port: 993,
              imap_username: profile.email,
              imap_security: 'SSL / TLS',
              imap_allow_insecure_ssl: false,
              smtp_host: 'smtp.office365.com',
              smtp_port: 587,
              smtp_username: profile.email,
              smtp_security: 'STARTTLS',
              smtp_allow_insecure_ssl: false,
              refresh_client_id: getO365ClientId(),
            },
          };
        }

        clearTimeout(timeout);
        closeServer();
        resolve(result);
      } catch (err: any) {
        clearTimeout(timeout);
        closeServer();
        reject(err);
      }
    });

    activeServer = server;

    server.listen(LOCAL_SERVER_PORT, '127.0.0.1', () => {
      log.info(`OAuth callback server listening on port ${LOCAL_SERVER_PORT}`);
    });

    server.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  return Promise.resolve(authUrl);
}

/** Wait for the OAuth callback to complete. Call after beginOAuth. */
export function awaitOAuth(): Promise<OAuthResult> {
  if (!pendingResult) {
    return Promise.reject(new Error('No OAuth flow in progress'));
  }
  return pendingResult;
}

export function cancelOAuth(): void {
  closeServer();
  pendingResult = null;
}
