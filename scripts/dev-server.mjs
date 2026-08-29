/**
 * PR MARKETPLACE - DEVELOPMENT SERVER
 *
 * A static file server that tells the browser not to cache anything.
 *
 * `python -m http.server` sends no Cache-Control header at all. Browsers then
 * fall back to heuristic caching, decide an edited stylesheet is probably
 * still fresh, and keep rendering the old one - so a change lands on disk, is
 * served correctly, and never reaches the screen. That is a genuinely
 * confusing failure, because everything looks right except what you see.
 *
 * No dependencies; runs on Node 18+.
 *
 *   node scripts/dev-server.mjs [port]
 */

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.argv[2] || process.env.PORT || 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.sql': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8'
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';

    // Keep requests inside the project directory.
    const filePath = join(ROOT, normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
    if (!filePath.startsWith(ROOT + sep) && filePath !== ROOT) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    const info = await stat(filePath).catch(() => null);
    if (!info || !info.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': info.size,
      // The whole point of this file.
      'Cache-Control': 'no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      // Lets the app use crossOriginIsolated APIs later without surprises.
      'X-Content-Type-Options': 'nosniff'
    });

    createReadStream(filePath).pipe(res);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' }).end('Server error');
  }
});

server.listen(PORT, () => {
  console.log(`\n  PR Marketplace running at http://localhost:${PORT}`);
  console.log('  Caching is disabled, so an edit shows up on a plain refresh.');
  console.log('  Press Ctrl+C to stop.\n');
});
