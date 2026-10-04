// Vercel serves public/ straight from its CDN, so copy the two modules the browser shares with the server there.
import { mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(root, 'public', 'lib'), { recursive: true });
for (const f of ['nps.js', 'snippet.js']) copyFileSync(join(root, 'src', f), join(root, 'public', 'lib', f));
console.log('Copied browser modules to public/lib');
