// Fills a database with a demo account and a year of sample answers for a made-up coffee shop.
// Usage: DATABASE_PATH=./data/demo.db DEMO_PASSWORD=... node scripts/seed-demo.mjs
import { openDb } from '../src/db.js';
import { hashPassword, token } from '../src/auth.js';
import * as store from '../src/store.js';
import { tx } from '../src/db.js';

const file = process.env.DATABASE_PATH || './data/demo.db';
const email = process.env.DEMO_EMAIL || 'demo@example.com';
const password = process.env.DEMO_PASSWORD || token(12);
const db = openDb(file);

// Small deterministic random generator so every run makes the same data.
let seed = 20261004;
const rand = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (a) => a[Math.floor(rand() * a.length)];

const COMMENTS = {
  promoter: [
    'Barista remembered my order on day three.', 'Mobile order was ready when I walked in.', 'Best cortado in the neighbourhood.',
    'Staff are quick and friendly, even at rush hour.', 'Quiet enough to work in the afternoons.', 'The seasonal pour-over is excellent.',
    'Love the new loyalty card.', 'Always clean, always consistent.', 'They fixed my order without any fuss.', 'Great place to meet clients.',
    'The banana bread alone is worth the trip.', 'Fast wifi and plenty of outlets.',
  ],
  passive: [
    'Good coffee. The wifi drops a lot.', 'Pastries sell out before noon.', 'Nice, but parking is hard.', 'Solid, a bit pricey for a flat white.',
    'Music is a little loud in the mornings.', 'Wish they opened earlier on weekends.', 'Fine. Nothing special about the food.',
  ],
  detractor: [
    'Oat milk ran out twice this week.', 'Got charged twice for one latte.', 'Waited 15 minutes for a drip coffee.', 'Prices went up again.',
    'The app kept logging me out.', 'Table was sticky and no one wiped it.', 'Order was wrong and nobody apologised.', 'Too crowded to find a seat.',
  ],
};
const NAMES = ['m.okafor', 'jen.alvarez', 'r.dimaano', 't.nakamura', 'priya.s', 'ben.whitlock', 'k.fontaine', 'luis.ortega', 'h.mensah', 'anya.k', 'd.reyes', 'sam.cole'];

function scoreFor(target) {
  // target is roughly the NPS we want for that month; nudge the score distribution toward it.
  const r = rand() * 100;
  const pro = 40 + target * 0.45;
  const det = Math.max(6, 22 - target * 0.3);
  if (r < pro) return rand() < 0.55 ? 10 : 9;
  if (r < 100 - det) return rand() < 0.5 ? 8 : 7;
  return pick([0, 2, 3, 4, 5, 5, 6, 6, 6]);
}

const now = new Date();
let user = store.userByEmail(db, email);
if (user) store.deleteUser(db, user.id);
const userId = store.createUser(db, email, hashPassword(password));
const surveyId = store.createSurvey(db, userId, { name: 'Customer NPS', brand: 'Copperline Coffee' });
store.createSurvey(db, userId, { name: 'Catering orders', brand: 'Copperline Coffee' });
const survey = db.prepare('SELECT * FROM surveys WHERE id = ?').get(surveyId);

// Older answers arrive through an import; the last few months come in live.
const imported = [];
const live = [];
for (let m = 15; m >= 0; m--) {
  const target = 16 + (15 - m) * 1.7 + (rand() - 0.5) * 8;
  const count = 28 + Math.floor(rand() * 22) + (m < 3 ? 16 : 0);
  for (let i = 0; i < count; i++) {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1 + Math.floor(rand() * 28), 7 + Math.floor(rand() * 12), Math.floor(rand() * 60)));
    if (day > now) continue;
    const score = scoreFor(target);
    const g = score >= 9 ? 'promoter' : score >= 7 ? 'passive' : 'detractor';
    const comment = rand() < 0.62 ? pick(COMMENTS[g]) : '';
    const mail = rand() < 0.45 ? `${pick(NAMES)}@example.com` : '';
    const row = { score, comment, email: mail, created_at: day.toISOString() };
    if (m >= 5) imported.push(row); else live.push({ ...row, source: pick(['email', 'email', 'link', 'widget', 'widget']) });
  }
}

tx(db, () => {
  const imp = db.prepare('INSERT INTO imports (survey_id, file_hash, file_name, row_count, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(surveyId, 'demo-import', 'getfeedback-responses-2025.csv', imported.length, new Date(now - 140 * 864e5).toISOString());
  const ins = db.prepare(`INSERT INTO responses (survey_id, score, comment, email, source, import_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  for (const r of imported) ins.run(surveyId, r.score, r.comment, r.email, 'import', imp.lastInsertRowid, r.created_at);
  for (const r of live) ins.run(surveyId, r.score, r.comment, r.email, r.source, null, r.created_at);
});

// A handful of very recent answers so the list reads like a live inbox.
const recent = [
  [9, 'Mobile order was ready when I walked in.', 'email', 38],
  [4, 'Oat milk ran out twice this week.', 'widget', 95],
  [10, 'Barista remembered my order on day three.', 'link', 160],
  [7, 'Pastries sell out before noon.', 'email', 310],
];
for (const [score, comment, source, minsAgo] of recent) {
  db.prepare('INSERT INTO responses (survey_id, score, comment, email, source, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(surveyId, score, comment, source === 'widget' ? '' : `${pick(NAMES)}@example.com`, source, new Date(now - minsAgo * 60000).toISOString());
}

const total = db.prepare('SELECT COUNT(*) AS n FROM responses WHERE survey_id = ?').get(surveyId).n;
console.log(`Seeded ${file}`);
console.log(`  login:    ${email}`);
console.log(`  password: ${password}`);
console.log(`  survey:   /s/${survey.public_id} (${total} answers)`);
