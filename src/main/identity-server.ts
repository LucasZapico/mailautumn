import { createServer, Server } from 'http';
import log from 'electron-log/main';

const PORT = 12142;
let server: Server | null = null;

/**
 * Local mock identity server. Mailsync contacts IDENTITY_SERVER for
 * plugin metadata deltas. We return empty/valid responses so sync
 * proceeds without the real Mailspring identity service.
 */
export function startIdentityServer(): string {
  if (server) return `http://127.0.0.1:${PORT}`;

  server = createServer((req, res) => {
    const url = req.url || '/';

    res.setHeader('Content-Type', 'application/json');

    // GET /deltas/{accountId}/head — return initial cursor
    if (url.match(/\/deltas\/[^/]+\/head/) && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify({ cursor: '0' }));
      return;
    }

    // GET /deltas/{accountId}/streaming — long-poll (hold connection 60s)
    if (url.match(/\/deltas\/[^/]+\/streaming/) && req.method === 'GET') {
      res.writeHead(200);
      // Hold the connection open to prevent mailsync from retrying in a tight loop
      const timer = setTimeout(() => {
        res.end(JSON.stringify([]));
      }, 60000);
      req.on('close', () => clearTimeout(timer));
      return;
    }

    // GET /deltas/{accountId}?cursor=X — return empty deltas
    if (url.match(/\/deltas\/[^/]+/) && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify([]));
      return;
    }

    // POST /deltas/{accountId} — accept metadata pushes
    if (url.match(/\/deltas\//) && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
      });
      return;
    }

    // POST /metadata/{accountId} — accept metadata
    if (url.match(/\/metadata\//) && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        res.writeHead(200);
        res.end(JSON.stringify([]));
      });
      return;
    }

    // GET /metadata/{accountId} — return empty metadata
    if (url.match(/\/metadata\//) && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify([]));
      return;
    }

    // Catch-all
    res.writeHead(200);
    res.end(JSON.stringify({}));
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      log.warn(`Identity server port ${PORT} already in use — reusing existing`);
      server?.close();
      server = null;
    } else {
      log.error('Identity server error:', err);
    }
  });

  server.listen(PORT, '127.0.0.1', () => {
    log.info(`Identity mock server on port ${PORT}`);
  });

  return `http://127.0.0.1:${PORT}`;
}

export function stopIdentityServer(): void {
  if (server) {
    server.close();
    server = null;
  }
}
