// Scoring, CSV parsing and import mapping. Pure functions, no I/O.

export const GROUPS = ['promoter', 'passive', 'detractor'];

export function group(score) {
  if (score >= 9) return 'promoter';
  if (score >= 7) return 'passive';
  return 'detractor';
}

// NPS = % promoters minus % detractors, rounded to a whole number. Null when there is nothing to score.
export function summarizeCounts({ promoter = 0, passive = 0, detractor = 0 }) {
  const counts = { promoter: Number(promoter), passive: Number(passive), detractor: Number(detractor) };
  const total = counts.promoter + counts.passive + counts.detractor;
  const nps = total ? Math.round(((counts.promoter - counts.detractor) / total) * 100) : null;
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  return {
    total,
    nps,
    counts,
    pct: { promoter: pct(counts.promoter), passive: pct(counts.passive), detractor: pct(counts.detractor) },
  };
}

export function summarize(scores) {
  const counts = { promoter: 0, passive: 0, detractor: 0 };
  for (const s of scores) counts[group(s)]++;
  return summarizeCounts(counts);
}

// Monthly NPS for the last `months` calendar months (UTC), oldest first.
export function monthlyTrend(responses, months = 12, now = new Date()) {
  const buckets = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    buckets.push({ key: d.toISOString().slice(0, 7), scores: [] });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const r of responses) {
    const b = byKey.get(new Date(r.created_at).toISOString().slice(0, 7));
    if (b) b.scores.push(r.score);
  }
  return buckets.map((b) => ({ month: b.key, ...summarize(b.scores) }));
}

export function parseScore(value) {
  const s = String(value ?? '').trim();
  if (!/^\d{1,2}(\.0+)?$/.test(s)) return null;
  const n = Number(s);
  return n >= 0 && n <= 10 ? n : null;
}

// RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines inside quotes, CRLF or LF.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = String(text).replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

export function toCsv(rows) {
  const cell = (v) => {
    let s = v == null ? '' : String(v);
    // Keep spreadsheet apps from running a cell as a formula.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

// Header names seen in exports from GetFeedback, Delighted and spreadsheets. First match wins.
const COLUMN_HINTS = {
  score: [/^(nps[ _]?)?score$/, /^rating$/, /^nps$/, /likely.*recommend|recommend.*likely/, /score/, /rating/],
  comment: [/^comments?$/, /^feedback$/, /^reason$/, /comment/, /feedback/, /verbatim|open[ _]?text|why/],
  email: [/^e-?mail$/, /e-?mail/],
  date: [/^(created|submitted|responded)([ _]?(at|on|date))?$/, /^date$/, /timestamp/, /date|time|created|submitted/],
};

export function detectColumns(header) {
  const names = header.map((h) => String(h).trim().toLowerCase());
  const used = new Set();
  const found = {};
  for (const [key, patterns] of Object.entries(COLUMN_HINTS)) {
    for (const re of patterns) {
      const i = names.findIndex((n, idx) => !used.has(idx) && re.test(n));
      if (i !== -1) { found[key] = i; used.add(i); break; }
    }
  }
  return found;
}

export function parseDate(value) {
  const s = String(value ?? '').trim();
  if (!s) return null;
  // Unix timestamps, in seconds or milliseconds.
  if (/^\d{10}$/.test(s)) return new Date(Number(s) * 1000);
  if (/^\d{13}$/.test(s)) return new Date(Number(s));
  // "2024-09-03 20:32:52" is common in exports but not every browser parses it, so read it as UTC.
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/);
  const t = m ? Date.parse(`${m[1]}T${m[2]}Z`) : Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
}

// Turns an exported CSV into rows ready to insert. Rows without a valid 0 to 10 score are skipped.
export function mapImport(text, { now = new Date(), maxRows = 50000 } = {}) {
  const rows = parseCsv(text);
  if (!rows.length) return { error: 'The file is empty.' };
  const columns = detectColumns(rows[0]);
  if (columns.score === undefined) {
    return { error: 'No score column found. Name one of the columns "Score", "Rating" or "NPS".' };
  }
  const header = rows[0];
  const out = [];
  let skipped = 0;
  for (const r of rows.slice(1, maxRows + 1)) {
    const score = parseScore(r[columns.score]);
    if (score === null) { skipped++; continue; }
    const date = columns.date !== undefined ? parseDate(r[columns.date]) : null;
    out.push({
      score,
      comment: columns.comment !== undefined ? clip(r[columns.comment], 2000) : '',
      email: columns.email !== undefined ? clip(r[columns.email], 254) : '',
      created_at: (date && date <= now ? date : now).toISOString(),
    });
  }
  skipped += Math.max(0, rows.length - 1 - maxRows);
  const used = Object.fromEntries(Object.entries(columns).map(([k, i]) => [k, header[i]]));
  return { rows: out, skipped, columns: used };
}

export function clip(value, max) {
  return String(value ?? '').trim().slice(0, max);
}
