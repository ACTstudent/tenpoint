import { test } from 'node:test';
import assert from 'node:assert/strict';
import { group, summarize, monthlyTrend, parseScore, parseCsv, toCsv, detectColumns, parseDate, mapImport } from '../src/nps.js';

test('groups scores the standard NPS way', () => {
  assert.deepEqual([0, 6, 7, 8, 9, 10].map(group), ['detractor', 'detractor', 'passive', 'passive', 'promoter', 'promoter']);
});

test('NPS is promoters minus detractors as a whole percentage', () => {
  const s = summarize([10, 9, 9, 8, 7, 6, 3]);
  assert.equal(s.total, 7);
  assert.deepEqual(s.counts, { promoter: 3, passive: 2, detractor: 2 });
  assert.equal(s.nps, 14); // (3 - 2) / 7 = 14.3%
  assert.equal(summarize([]).nps, null);
  assert.equal(summarize([0, 1]).nps, -100);
});

test('monthly trend buckets answers by UTC month, oldest first', () => {
  const now = new Date('2026-10-04T12:00:00Z');
  const t = monthlyTrend([
    { score: 10, created_at: '2026-10-01T00:00:00Z' },
    { score: 2, created_at: '2026-10-02T00:00:00Z' },
    { score: 9, created_at: '2026-08-15T00:00:00Z' },
    { score: 9, created_at: '2024-01-01T00:00:00Z' },
  ], 3, now);
  assert.deepEqual(t.map((m) => m.month), ['2026-08', '2026-09', '2026-10']);
  assert.deepEqual(t.map((m) => m.nps), [100, null, 0]);
});

test('scores must be whole numbers from 0 to 10', () => {
  assert.equal(parseScore('9'), 9);
  assert.equal(parseScore(' 10 '), 10);
  assert.equal(parseScore('7.0'), 7);
  for (const bad of ['', '11', '-1', '7.5', 'N/A', null, undefined, '1e1']) assert.equal(parseScore(bad), null, String(bad));
});

test('CSV parser handles quotes, commas, newlines and a BOM', () => {
  const rows = parseCsv('﻿a,b,c\r\n1,"x, y","line\nbreak"\n2,"say ""hi""",\n\n');
  assert.deepEqual(rows, [['a', 'b', 'c'], ['1', 'x, y', 'line\nbreak'], ['2', 'say "hi"', '']]);
});

test('CSV writer quotes where needed and defuses spreadsheet formulas', () => {
  assert.equal(toCsv([['a', 'b,c', 'd"e'], ['=SUM(A1)', '+1', 'ok']]), 'a,"b,c","d""e"\r\n\'=SUM(A1),\'+1,ok\r\n');
});

test('detects columns from common export headers', () => {
  assert.deepEqual(detectColumns(['Response ID', 'Score', 'Comment', 'Person Email', 'Created At']), { score: 1, comment: 2, email: 3, date: 4 });
  assert.deepEqual(detectColumns(['How likely are you to recommend us?', 'Why?', 'Submitted']), { score: 0, comment: 1, date: 2 });
  assert.equal(detectColumns(['Name', 'Notes']).score, undefined);
});

test('parses the date formats exports use', () => {
  assert.equal(parseDate('2024-09-03 20:32:52').toISOString(), '2024-09-03T20:32:52.000Z');
  assert.equal(parseDate('2024-09-03T20:32:52Z').toISOString(), '2024-09-03T20:32:52.000Z');
  assert.equal(parseDate('1700000000').toISOString(), '2023-11-14T22:13:20.000Z');
  assert.equal(parseDate('1700000000000').toISOString(), '2023-11-14T22:13:20.000Z');
  assert.equal(parseDate('not a date'), null);
  assert.equal(parseDate(''), null);
});

test('maps an export into rows, skipping rows without a valid score', () => {
  const now = new Date('2026-10-04T00:00:00Z');
  const csv = 'Score,Comment,Email,Created At\n9,Great,a@example.com,2025-01-02 03:04:05\n,blank,,2025-01-03\n11,too high,,\n4,"Slow, cold",,2030-01-01\n';
  const r = mapImport(csv, { now });
  assert.equal(r.skipped, 2);
  assert.deepEqual(r.columns, { score: 'Score', comment: 'Comment', email: 'Email', date: 'Created At' });
  assert.deepEqual(r.rows[0], { score: 9, comment: 'Great', email: 'a@example.com', created_at: '2025-01-02T03:04:05.000Z' });
  // A date in the future is replaced with the import time.
  assert.equal(r.rows[1].created_at, now.toISOString());
  assert.match(mapImport('Name\nBob\n').error, /No score column/);
  assert.match(mapImport('').error, /empty/);
});
