import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const files = new Set(['index.html','style.css','still.js','app.js','core.js','sw.js','icon.svg','manifest.webmanifest']);
const types = { html: 'text/html; charset=utf-8', css: 'text/css', js: 'text/javascript', svg: 'image/svg+xml', webmanifest: 'application/manifest+json' };
const base = fileURLToPath(new URL('./', import.meta.url));
const port = Number(process.env.PORT) || 4173;
createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
    const path = url.pathname.replace(/^\/flights\//, '/');
    const name = path === '/' ? 'index.html' : path.slice(1);
    if (!files.has(name)) { response.writeHead(404); response.end('Not found'); return; }
    const content = await readFile(`${base}${name}`);
    response.writeHead(200, { 'Content-Type': types[name.split('.').pop()], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch { response.writeHead(500); response.end('Unable to load this page.'); }
}).listen(port, '127.0.0.1', () => console.log(`Still is ready at http://127.0.0.1:${port}/flights/`));
