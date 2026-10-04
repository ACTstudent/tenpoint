import { html, raw, page, brand, textOn, asset } from '../html.js';

function brandStyle(survey) {
  return `--brand:${survey.color};--brand-ink:${textOn(survey.color)}`;
}

export function scaleInputs(selected, name = 'score') {
  return raw(Array.from({ length: 11 }, (_, n) => {
    const id = `${name}-${n}`;
    return `<input type="radio" class="pick-input" name="${name}" id="${id}" value="${n}"${n === selected ? ' checked' : ''} required><label class="pick" for="${id}">${n}</label>`;
  }).join(''));
}

export function surveyPage({ survey, score, source, email, error }) {
  const autosave = source === 'email' && score !== null;
  const body = html`
<main class="respond" style="${brandStyle(survey)}">
  <form class="respond-card" method="post" action="/s/${survey.public_id}" data-respond data-survey="${survey.public_id}"${autosave ? raw(' data-autosave') : ''}>
    ${survey.brand ? html`<p class="respond-brand">${survey.brand}</p>` : ''}
    ${error ? html`<p class="form-error" role="alert">${error}</p>` : ''}
    <fieldset class="scale-field">
      <legend class="respond-q">${survey.question}</legend>
      <div class="scale" data-scale>${scaleInputs(score)}</div>
      <div class="scale-ends" aria-hidden="true"><span>Not likely</span><span>Very likely</span></div>
    </fieldset>
    <p class="respond-saved" data-saved hidden role="status">Thanks, your score is saved. You can add a reason below.</p>
    <div class="field">
      <label for="comment">${survey.follow_up}</label>
      <textarea id="comment" name="comment" rows="4" maxlength="2000" data-comment></textarea>
      <p class="hint">Optional</p>
    </div>
    <input type="hidden" name="src" value="${source}">
    <input type="hidden" name="email" value="${email}">
    <input type="hidden" name="rid" value="" data-rid>
    <input type="hidden" name="rt" value="" data-rt>
    <button class="btn btn-brand btn-block" type="submit">Send</button>
  </form>
  <p class="respond-foot">Survey by <a href="/">Tenpoint</a></p>
</main>`;
  return page({
    title: survey.brand ? `A quick question from ${survey.brand}` : 'A quick question',
    body,
    bodyClass: 'page-respond',
    scripts: ['/survey.js'],
  });
}

export function thanksPage({ survey }) {
  const body = html`
<main class="respond" style="${brandStyle(survey)}">
  <div class="respond-card respond-thanks">
    ${survey.brand ? html`<p class="respond-brand">${survey.brand}</p>` : ''}
    <h1>Thank you.</h1>
    <p>Your answer was sent. You can close this page.</p>
  </div>
  <p class="respond-foot">Survey by <a href="/">Tenpoint</a></p>
</main>`;
  return page({ title: 'Thank you', body, bodyClass: 'page-respond' });
}

export function widgetPreviewPage({ survey }) {
  const body = html`
<main class="preview-site">
  <header class="preview-bar">${brand()}<span>Widget preview</span></header>
  <section class="preview-copy">
    <h1>This is a test page.</h1>
    <p>The card in the corner is how the widget looks on your site. Answers sent from here are saved to <strong>${survey.name}</strong> like any other answer, so you can try the whole flow.</p>
    <p>On a real site it waits a few seconds before it appears, and stays hidden for 90 days once someone answers or closes it.</p>
  </section>
</main>
<script src="${asset('/widget.js')}" data-survey="${survey.public_id}" data-delay="0" data-preview async></script>`;
  return page({ title: `Widget preview: ${survey.name}`, body, bodyClass: 'page-preview' });
}
