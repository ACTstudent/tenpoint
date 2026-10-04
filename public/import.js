import { mapImport, summarize } from '/lib/nps.js';

// Reads the chosen CSV in the browser, shows what the import will do, then sends the rows in parts.
// Each part stays well under the 4.5 MB request limit that serverless hosts such as Vercel apply.
const form = document.querySelector('[data-import]');
if (form) {
  const file = form.querySelector('[data-csv-file]');
  const area = form.querySelector('[data-csv]');
  const name = form.querySelector('[data-file-name]');
  const out = form.querySelector('[data-import-preview]');
  const submit = form.querySelector('[data-import-submit]');
  const action = new URL(form.action, location.href).pathname;
  const importsUrl = action.replace(/\/import$/, '/imports');
  const resultsUrl = action.replace(/\/import$/, '');
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = (iso) => { const d = new Date(iso); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const fmt = (n) => n.toLocaleString('en-US');
  const label = (r) => (r ? `Import ${fmt(r.rows.length)} answers` : 'Import answers');
  let current = null;

  const showError = (text) => {
    out.hidden = false;
    out.replaceChildren(el('p', 'form-error', text));
  };

  const preview = () => {
    const text = area.value;
    out.replaceChildren();
    current = null;
    if (!text.trim()) { out.hidden = true; submit.disabled = false; submit.textContent = label(null); return; }
    out.hidden = false;
    const r = mapImport(text);
    if (r.error || !r.rows.length) {
      showError(r.error || 'No rows had a score from 0 to 10.');
      submit.disabled = true;
      return;
    }
    current = r;
    const dates = r.rows.map((x) => x.created_at).sort();
    const s = summarize(r.rows.map((x) => x.score));
    const dl = el('dl', 'check-stats');
    const stat = (title, value) => { const d = el('div', 'check-stat'); d.append(el('dt', '', title), el('dd', '', value)); return d; };
    dl.append(
      stat('Answers', fmt(r.rows.length)),
      stat('NPS', s.nps > 0 ? `+${s.nps}` : String(s.nps)),
      stat('Dates', month(dates[0]) === month(dates.at(-1)) ? month(dates[0]) : `${month(dates[0])} to ${month(dates.at(-1))}`),
    );
    const cols = Object.entries({ Score: r.columns.score, Comment: r.columns.comment, Email: r.columns.email, Date: r.columns.date })
      .map(([k, v]) => (v ? `${k} from "${v}"` : `no ${k.toLowerCase()} column`)).join(', ');
    out.append(dl, el('p', 'check-note', `Found: ${cols}.${r.skipped ? ` ${fmt(r.skipped)} rows without a valid score will be skipped.` : ''}`));
    submit.disabled = false;
    submit.textContent = label(r);
  };

  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) {
      showError('That file is larger than 8 MB. Split it into smaller files and import them one at a time.');
      submit.disabled = true;
      return;
    }
    area.value = await f.text();
    name.value = f.name;
    preview();
  });
  let t = 0;
  area.addEventListener('input', () => { name.value = ''; clearTimeout(t); t = setTimeout(preview, 250); });

  const sha256 = async (text) => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  const post = async (url, data) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    let body = {};
    try { body = await res.json(); } catch { /* not JSON */ }
    if (res.status === 401) throw new Error('Your session ended. Log in again, then retry the import.');
    if (!res.ok) throw new Error(body.error || 'The import stopped part way. Please try again.');
    return body;
  };

  // Up to 2,000 rows and about 2.5 MB per part.
  function* parts(rows) {
    let part = [];
    let size = 0;
    for (const r of rows) {
      const n = JSON.stringify(r).length + 1;
      if (part.length && (part.length === 2000 || size + n > 2.5e6)) { yield part; part = []; size = 0; }
      part.push(r);
      size += n;
    }
    if (part.length) yield part;
  }

  form.addEventListener('submit', async (e) => {
    if (!area.value.trim()) {
      e.preventDefault();
      showError('Choose a CSV file, or paste its contents.');
      return;
    }
    // Without the Web Crypto API (plain http on a remote host) the form posts the CSV as it is.
    if (!window.crypto || !crypto.subtle) return;
    e.preventDefault();
    const r = current || mapImport(area.value);
    if (r.error || !r.rows.length) { showError(r.error || 'No rows had a score from 0 to 10.'); return; }
    submit.disabled = true;
    submit.textContent = 'Importing…';
    let importId = null;
    try {
      const fileHash = await sha256(area.value.replace(/\r\n?/g, '\n'));
      importId = (await post(importsUrl, { fileHash, fileName: name.value, total: r.rows.length })).id;
      let sent = 0;
      for (const part of parts(r.rows)) {
        await post(`${importsUrl}/${importId}/rows`, { rows: part });
        sent += part.length;
        submit.textContent = `Importing ${fmt(sent)} of ${fmt(r.rows.length)}…`;
      }
      location.assign(`${resultsUrl}?range=all&m=imported&n=${r.rows.length}&s=${r.skipped}`);
    } catch (err) {
      // Never leave half an import behind.
      if (importId) await fetch(`${importsUrl}/${importId}/undo`, { method: 'POST', headers: { 'Content-Type': 'application/json' } }).catch(() => {});
      showError(err.message || 'The import failed. Nothing was saved.');
      submit.disabled = false;
      submit.textContent = label(current);
    }
  });
}
