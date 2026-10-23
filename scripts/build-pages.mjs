import { cp, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
execFileSync(process.execPath, [fileURLToPath(new URL('flights/build.mjs', root))], { stdio: 'inherit' });
const dist = new URL('dist/', root);
await mkdir(new URL('flights/', dist), { recursive: true });
await cp(new URL('trollfjord/', root), new URL('trollfjord/', dist), { recursive: true });
for (const name of ['index.html', 'style.css', 'still.js', 'sw.js', 'icon.svg', 'manifest.webmanifest']) {
  await cp(new URL(`flights/${name}`, root), new URL(`flights/${name}`, dist));
}
await writeFile(new URL('404.html', dist), '<!doctype html><title>404</title><h1>Page not found</h1>');
await writeFile(new URL('_routes.json', dist), JSON.stringify({ version: 1, include: ['/flights/api/*'], exclude: [] }));
console.log('Cloudflare Pages ready in dist/');
