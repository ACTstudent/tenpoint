import { mapImport, summarize } from '/lib/nps.js';

// Reads the chosen CSV in the browser and shows what the import will do before anything is sent.
const form = document.querySelector('[data-import]');
if (form) {
  const file = form.querySelector('[data-csv-file]');
  const area = form.querySelector('[data-csv]');
  const name = form.querySelector('[data-file-name]');
  const out = form.querySelector('[data-import-preview]');
  const submit = form.querySelector('[data-import-submit]');
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = (iso) => { const d = new Date(iso); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };

  const preview = () => {
    const text = area.value;
    out.replaceChildren();
    if (!text.trim()) { out.hidden = true; submit.disabled = false; submit.textContent = 'Import answers'; return; }
    out.hidden = false;
    const r = mapImport(text);
    if (r.error || !r.rows.length) {
      out.append(el('p', 'form-error', r.error || 'No rows had a score from 0 to 10.'));
      submit.disabled = true;
      return;
    }
    const dates = r.rows.map((x) => x.created_at).sort();
    const s = summarize(r.rows.map((x) => x.score));
    const dl = el('dl', 'check-stats');
    const stat = (label, value) => { const d = el('div', 'check-stat'); d.append(el('dt', '', label), el('dd', '', value)); return d; };
    dl.append(
      stat('Answers', r.rows.length.toLocaleString('en-US')),
      stat('NPS', s.nps > 0 ? `+${s.nps}` : String(s.nps)),
      stat('Dates', month(dates[0]) === month(dates.at(-1)) ? month(dates[0]) : `${month(dates[0])} to ${month(dates.at(-1))}`),
    );
    const cols = Object.entries({ Score: r.columns.score, Comment: r.columns.comment, Email: r.columns.email, Date: r.columns.date })
      .map(([k, v]) => (v ? `${k} from "${v}"` : `no ${k.toLowerCase()} column`)).join(', ');
    out.append(dl, el('p', 'check-note', `Found: ${cols}.${r.skipped ? ` ${r.skipped.toLocaleString('en-US')} rows without a valid score will be skipped.` : ''}`));
    submit.disabled = false;
    submit.textContent = `Import ${r.rows.length.toLocaleString('en-US')} answers`;
  };

  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) {
      out.hidden = false;
      out.replaceChildren(el('p', 'form-error', 'That file is larger than 8 MB. Split it into smaller files and import them one at a time.'));
      submit.disabled = true;
      return;
    }
    area.value = await f.text();
    name.value = f.name;
    preview();
  });
  let t = 0;
  area.addEventListener('input', () => { name.value = ''; clearTimeout(t); t = setTimeout(preview, 250); });
  form.addEventListener('submit', (e) => {
    if (!area.value.trim()) {
      e.preventDefault();
      out.hidden = false;
      out.replaceChildren(el('p', 'form-error', 'Choose a CSV file, or paste its contents.'));
      return;
    }
    submit.disabled = true;
    submit.textContent = 'Importing…';
  });
}
