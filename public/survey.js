// The public survey page. Works without JS; with it, a score clicked in an email is saved straight away.
const form = document.querySelector('[data-respond]');

if (form) {
  const pid = form.dataset.survey;
  const rid = form.querySelector('[data-rid]');
  const rt = form.querySelector('[data-rt]');
  const saved = form.querySelector('[data-saved]');
  const key = `tenpoint:${pid}`;
  const read = () => { try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { return null; } };
  const write = (v) => { try { sessionStorage.setItem(key, JSON.stringify(v)); } catch {} };
  const picked = () => form.querySelector('input[name="score"]:checked');

  const post = async (url, body) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  };

  // Records the score, or updates it if this visit already recorded one.
  const save = async (score) => {
    const prev = read();
    if (prev && prev.id) {
      try {
        await post(`/api/r/${pid}/${prev.id}`, { token: prev.token, score });
        rid.value = prev.id;
        rt.value = prev.token;
        return true;
      } catch { /* fall through and record a new answer */ }
    }
    const email = form.querySelector('input[name="email"]').value;
    const r = await post(`/api/r/${pid}`, { score, source: 'email', email });
    write({ id: r.id, token: r.token });
    rid.value = r.id;
    rt.value = r.token;
    return true;
  };

  if (form.hasAttribute('data-autosave') && picked()) {
    save(Number(picked().value)).then(() => { saved.hidden = false; }).catch(() => {});
    form.addEventListener('change', (e) => {
      if (e.target.name === 'score' && rid.value) save(Number(e.target.value)).catch(() => {});
    });
  }

  form.addEventListener('submit', () => {
    try { sessionStorage.removeItem(key); } catch {}
    const btn = form.querySelector('button[type="submit"]');
    // Stop double submits without blocking the first one.
    setTimeout(() => { btn.disabled = true; }, 0);
  });
}
