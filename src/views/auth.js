import { html, page, brand } from '../html.js';

function authPage({ title, heading, sub, action, submit, values = {}, error, switchText, switchHref, switchLabel, newPassword }) {
  const body = html`
<main class="auth">
  <div class="auth-top">${brand()}</div>
  <form class="auth-card" method="post" action="${action}" novalidate data-auth>
    <h1>${heading}</h1>
    <p class="auth-sub">${sub}</p>
    ${error ? html`<p class="form-error" role="alert" id="form-error">${error}</p>` : ''}
    <div class="field">
      <label for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="email" spellcheck="false" required value="${values.email || ''}"${error ? html` aria-describedby="form-error"` : ''}>
    </div>
    <div class="field">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="${newPassword ? 'new-password' : 'current-password'}" required minlength="${newPassword ? 8 : 1}"${newPassword ? html` aria-describedby="password-hint"` : ''}>
      ${newPassword ? html`<p class="hint" id="password-hint">At least 8 characters.</p>` : ''}
    </div>
    <button class="btn btn-dark btn-block" type="submit">${submit}</button>
    <p class="auth-switch">${switchText} <a href="${switchHref}">${switchLabel}</a></p>
  </form>
</main>`;
  return page({ title, body, bodyClass: 'page-auth' });
}

export function signupPage({ values, error } = {}) {
  return authPage({
    title: 'Create your account | Tenpoint',
    heading: 'Create your account',
    sub: 'Free during early access. No card needed.',
    action: '/signup',
    submit: 'Create account',
    values,
    error,
    switchText: 'Already have an account?',
    switchHref: '/login',
    switchLabel: 'Log in',
    newPassword: true,
  });
}

export function loginPage({ values, error } = {}) {
  return authPage({
    title: 'Log in | Tenpoint',
    heading: 'Welcome back',
    sub: 'Log in to see your answers.',
    action: '/login',
    submit: 'Log in',
    values,
    error,
    switchText: 'New to Tenpoint?',
    switchHref: '/signup',
    switchLabel: 'Create an account',
  });
}
