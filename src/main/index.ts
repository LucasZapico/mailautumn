import { app, BrowserWindow, clipboard, Menu, MenuItem, shell, protocol, net } from 'electron';
import path, { join } from 'path';
import fs from 'fs';
import { is } from '@electron-toolkit/utils';

// Load .env file (gitignored) for OAuth credentials
const envPath = join(__dirname, '..', '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^([A-Z_]+)\s*=\s*(.+)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
}
// Also check packaged app location
const envPathPkg = join(process.resourcesPath || '', '..', '.env');
if (!fs.existsSync(envPath) && fs.existsSync(envPathPkg)) {
  for (const line of fs.readFileSync(envPathPkg, 'utf-8').split('\n')) {
    const match = line.match(/^([A-Z_]+)\s*=\s*(.+)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
}
import log from 'electron-log/main';
import { openDatabase, closeDatabase, getConfigDir } from './database';
import { getAllAccountsForSync, refreshMissingAvatars } from './accounts';
import { registerIpcHandlers } from './ipc-handlers';
import { startSyncForAccount, stopAllSync } from './mailsync';
import { stopIdentityServer } from './identity-server';
import { loadAISettings, checkAIConnection } from './ai-classify';
import { openCrmDb, closeCrmDb } from './crm-db';
import { registerCrmHandlers } from './crm-handlers';

// Register custom protocol for serving local email attachment files.
// Must be called before app.whenReady().
protocol.registerSchemesAsPrivileged([{
  scheme: 'mailspring-file',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
}]);

// ── Logging ──
log.initialize();
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

// Prevent multiple instances — must be before anything else
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  log.initialize();
  log.warn('Another instance is running — quitting');
  app.quit();
  // process.exit ensures we don't race with app.whenReady()
  process.exit(0);
}

log.info(`Mailautumn starting — v${app.getVersion()}`);
log.info(`Platform: ${process.platform} ${process.arch}`);
log.info(`Electron: ${process.versions.electron}, Chrome: ${process.versions.chrome}, Node: ${process.versions.node}`);

// Warn if OAuth credentials are missing
if (!process.env.MS_GMAIL_CLIENT_ID || !process.env.MS_GMAIL_CLIENT_SECRET) {
  log.warn('Gmail OAuth credentials not set. Create a .env file or set MS_GMAIL_CLIENT_ID + MS_GMAIL_CLIENT_SECRET. See README for setup.');
}
if (!process.env.MS_O365_CLIENT_ID) {
  log.warn('O365 OAuth credentials not set. Set MS_O365_CLIENT_ID for Outlook support. See README for setup.');
}

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'Mailautumn',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
    log.info('Main window ready');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // ── Context menu (spellcheck, copy/paste, etc.) ──
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const menu = new Menu();

    // Spelling suggestions (only in editable fields with a misspelled word)
    if (params.isEditable && params.misspelledWord) {
      if (params.dictionarySuggestions.length > 0) {
        for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
          menu.append(new MenuItem({
            label: suggestion,
            click: () => mainWindow?.webContents.replaceMisspelling(suggestion),
          }));
        }
      } else {
        menu.append(new MenuItem({ label: 'No suggestions', enabled: false }));
      }
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({
        label: 'Add to Dictionary',
        click: () => mainWindow?.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
      }));
      menu.append(new MenuItem({ type: 'separator' }));
    }

    // Editable fields: full editing menu
    if (params.isEditable) {
      menu.append(new MenuItem({ role: 'undo' }));
      menu.append(new MenuItem({ role: 'redo' }));
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({ role: 'cut', enabled: !!params.selectionText }));
      menu.append(new MenuItem({ role: 'copy', enabled: !!params.selectionText }));
      menu.append(new MenuItem({ role: 'paste' }));
      menu.append(new MenuItem({ role: 'selectAll' }));
    } else if (params.selectionText) {
      // Read-only text selected
      menu.append(new MenuItem({ role: 'copy' }));
    }

    // Link handling
    if (params.linkURL) {
      if (menu.items.length > 0) menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({
        label: 'Open Link',
        click: () => shell.openExternal(params.linkURL),
      }));
      menu.append(new MenuItem({
        label: 'Copy Link Address',
        click: () => clipboard.writeText(params.linkURL),
      }));
    }

    if (menu.items.length > 0) {
      menu.popup();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
    log.debug(`Loading dev URL: ${process.env['ELECTRON_RENDERER_URL']}`);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// ── App lifecycle ──

app.whenReady().then(() => {
  log.info('App ready');

  // Register protocol handler for local attachment files (cid: resolution)
  protocol.handle('mailspring-file', (request) => {
    const url = new URL(request.url);
    const filePath = path.join(getConfigDir(), decodeURIComponent(url.pathname));
    return net.fetch(`file://${filePath}`);
  });

  // Register IPC handlers before window creation
  registerIpcHandlers();
  registerCrmHandlers();

  // Load AI classification settings
  loadAISettings();

  const isDemo = process.env.DEMO_MODE === 'true';
  if (isDemo) {
    log.info('Demo mode active — skipping database, sync, and AI check');
  }

  // Try to open existing database
  const dbReady = !isDemo && openDatabase();
  log.info(`Database: ${dbReady ? 'opened' : isDemo ? 'skipped (demo mode)' : 'not found (needs account setup)'}`);

  // Initialize CRM tables (after DB is open)
  if (dbReady) openCrmDb();

  // Start sync for all configured accounts
  if (dbReady) {
    const syncAccounts = getAllAccountsForSync();
    for (const acct of syncAccounts) {
      startSyncForAccount(acct);
    }
    log.info(`Started sync for ${syncAccounts.length} account(s)`);
  }

  createWindow();

  // Check AI connection (non-blocking)
  if (!isDemo) {
    checkAIConnection().then((result) => {
      if (mainWindow?.webContents) {
        mainWindow.webContents.send('ai:status', result);
      }
    }).catch(err => log.warn('AI connection check failed:', err));
  }

  // Backfill missing profile pictures (non-blocking)
  // Notify renderer to re-read accounts when done
  refreshMissingAvatars().then((updated) => {
    if (updated && mainWindow?.webContents) {
      mainWindow.webContents.send('accounts-updated');
    }
  }).catch(err => log.warn('Avatar refresh failed:', err));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopAllSync();
  stopIdentityServer();
  closeCrmDb();
  closeDatabase();
});

// Focus existing window when a second instance tries to launch
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

process.on('uncaughtException', (error) => {
  log.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection:', reason);
});
