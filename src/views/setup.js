import { html, page, brand } from '../html.js';

// Shown on Vercel until a database is connected, so a fresh deploy explains itself instead of crashing.
export function setupPage({ problem }) {
  const body = html`
<main class="auth">
  <div class="auth-top">${brand()}</div>
  <div class="auth-card setup-card">
    <h1>${problem === 'missing' ? 'Connect a database' : "Can't reach the database"}</h1>
    ${problem === 'missing'
      ? html`<p class="auth-sub">Tenpoint stores surveys and answers in a Turso database. Vercel can create one for you.</p>
    <ol class="setup-steps">
      <li>In your Vercel project, open <strong>Storage</strong> and choose <strong>Turso Cloud</strong> from the Marketplace.</li>
      <li>Create a database and connect it to this project. Vercel adds <code>TURSO_DATABASE_URL</code> and <code>TURSO_AUTH_TOKEN</code> for you.</li>
      <li>Redeploy. Tenpoint creates its tables on the first request.</li>
    </ol>`
      : html`<p class="auth-sub">The database settings are there, but the connection failed. Check that <code>TURSO_DATABASE_URL</code> and <code>TURSO_AUTH_TOKEN</code> belong to the same database and that the token hasn't expired, then redeploy. The function logs have the details.</p>`}
  </div>
</main>`;
  return page({ title: 'Set up Tenpoint', body, bodyClass: 'page-auth' });
}
