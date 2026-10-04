// Request and response helpers for node:http.
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { extname, join, normalize, sep } from 'node:path';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Reads the body up to `limit` bytes. A body a little over the limit is drained so a proper error page
// can still be sent; anything far larger is cut off.
export function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const tooBig = () => new HttpError(413, 'That upload is too large.');
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > limit * 4) {
      req.destroy();
      return reject(tooBig());
    }
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit * 4) {
        req.destroy();
        reject(tooBig());
      } else if (size <= limit) {
        chunks.push(c);
      }
    });
    req.on('end', () => (size > limit ? reject(tooBig()) : resolve(Buffer.concat(chunks).toString('utf8'))));
    req.on('error', reject);
  });
}

export async function readForm(req, limit = 64 * 1024) {
  const type = String(req.headers['content-type'] || '');
  const text = await readBody(req, limit);
  if (type.startsWith('application/json')) {
    try {
      const data = JSON.parse(text || '{}');
      return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch {
      throw new HttpError(400, 'The request body is not valid JSON.');
    }
  }
  return Object.fromEntries(new URLSearchParams(text));
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const k = part.slice(0, i).trim();
    if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function cookie(name, value, { maxAge, secure } = {}) {
  let c = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax`;
  if (maxAge !== undefined) c += `; Max-Age=${maxAge}`;
  if (secure) c += '; Secure';
  return c;
}

const CSP = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self'",
  "font-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

export function baseHeaders(extra = {}) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    ...extra,
  };
}

export function sendHtml(res, status, body, headers = {}) {
  res.writeHead(status, baseHeaders({
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': CSP,
    'Cache-Control': 'no-store',
    ...headers,
  }));
  res.end(body);
}

export function sendJson(res, status, data, headers = {}) {
  res.writeHead(status, baseHeaders({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }));
  res.end(JSON.stringify(data));
}

export function redirect(res, location, headers = {}) {
  res.writeHead(303, baseHeaders({ Location: location, 'Cache-Control': 'no-store', ...headers }));
  res.end();
}

// Static files from one directory. Names with a ?v= query string are cached for a year.
const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

export function staticFiles(root) {
  const cache = new Map();
  return async function serve(req, res, pathname, extraHeaders = {}) {
    let rel;
    try {
      rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
    } catch {
      return false;
    }
    if (!rel || rel.startsWith('..') || rel.includes(`${sep}..`)) return false;
    const file = join(root, rel);
    if (!file.startsWith(root + sep)) return false;
    const type = TYPES[extname(file)];
    if (!type) return false;
    let entry = cache.get(file);
    try {
      const info = await stat(file);
      if (!info.isFile()) return false;
      if (!entry || entry.mtime !== info.mtimeMs) {
        const body = await readFile(file);
        entry = { body, mtime: info.mtimeMs, etag: `"${createHash('sha1').update(body).digest('base64url').slice(0, 16)}"` };
        cache.set(file, entry);
      }
    } catch {
      return false;
    }
    const versioned = /[?&]v=/.test(req.url);
    const headers = baseHeaders({
      'Content-Type': type,
      ETag: entry.etag,
      'Cache-Control': versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
      ...extraHeaders,
    });
    if (req.headers['if-none-match'] === entry.etag) {
      res.writeHead(304, headers);
      res.end();
      return true;
    }
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : entry.body);
    return true;
  };
}

export function fileVersion(...buffers) {
  const h = createHash('sha1');
  for (const b of buffers) h.update(b);
  return h.digest('base64url').slice(0, 10);
}

// Fixed-window counter kept in memory. Good enough for one process.
export function rateLimiter({ limit, windowMs }) {
  const hits = new Map();
  return function allow(key) {
    const t = Date.now();
    const e = hits.get(key);
    if (!e || t - e.start > windowMs) {
      hits.set(key, { start: t, n: 1 });
      if (hits.size > 50000) for (const [k, v] of hits) if (t - v.start > windowMs) hits.delete(k);
      return true;
    }
    e.n++;
    return e.n <= limit;
  };
}

export function clientIp(req, trustProxy) {
  if (trustProxy) {
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (fwd) return fwd;
  }
  return req.socket.remoteAddress || 'unknown';
}
