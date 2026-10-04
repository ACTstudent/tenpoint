import { html, raw, icon, page, brand, themeToggle } from '../html.js';
import { emailSnippet } from '../snippet.js';
import { scaleInputs } from './survey.js';

const TOUR = [
  {
    key: 'survey',
    focus: '50% 45%',
    tab: 'Survey page',
    title: 'A page that takes ten seconds',
    text: "Customers tap a number, add a reason if they want to, and they're done. No account and no app to install.",
    alt: 'The survey page: a question from Copperline Coffee with a row of buttons from 0 to 10 and a box for a reason.',
  },
  {
    key: 'email',
    focus: '92% 40%',
    tab: 'Email buttons',
    title: 'Buttons that work inside email',
    text: 'Paste the row of numbers into Mailchimp, HubSpot or your help desk. One click records the score.',
    alt: 'The Share tab: a survey link, the widget code, and a preview of the 0 to 10 email buttons with their HTML.',
  },
  {
    key: 'widget',
    focus: '100% 100%',
    tab: 'Site widget',
    title: 'A small card on your site',
    text: 'One script tag. It waits a few seconds, asks once, and stays away for 90 days after an answer.',
    alt: 'A web page with the Tenpoint widget open in the bottom corner, showing the 0 to 10 question.',
  },
  {
    key: 'results',
    focus: '0% 30%',
    tab: 'Results',
    title: 'Your score, split and trended',
    text: 'Promoters, passives and detractors, a year of history, and every comment, filtered however you like.',
    alt: 'The Results tab: an NPS of +47 over 90 days, the split between promoters, passives and detractors, a monthly chart and a list of comments.',
  },
  {
    key: 'import',
    focus: '0% 45%',
    tab: 'Import',
    title: 'Your history comes too',
    text: 'Upload an export from GetFeedback or Delighted. Every answer keeps the date it was first given.',
    alt: 'The Import tab with a CSV checked and ready: the columns it found, the number of answers and their date range.',
  },
];

const INCLUDED = ['Unlimited surveys', 'Unlimited answers', 'Email buttons', 'Site widget', 'CSV import', 'Slack alerts', 'CSV export', 'Your name and colour'];

const SWATCHES = [
  ['#1d7a50', 'Green'],
  ['#2f5bd3', 'Blue'],
  ['#b5462e', 'Brick'],
  ['#0e7c86', 'Teal'],
  ['#111413', 'Black'],
];

function shot(key, alt, eager) {
  // theme.js swaps in the dark screenshot when dark mode is on.
  return html`<picture>
    <img src="/shots/tour-${key}-light.webp" data-src-light="/shots/tour-${key}-light.webp" data-src-dark="/shots/tour-${key}-dark.webp" width="1600" height="1000" alt="${alt}"${eager ? '' : raw(' loading="lazy"')} decoding="async">
  </picture>`;
}

export function landing({ user }) {
  const authLinks = user
    ? html`<a class="btn btn-dark" href="/app">Open dashboard</a>`
    : html`<a class="nav-link" href="/login">Log in</a><a class="btn btn-dark" href="/signup">Start free</a>`;

  const tabs = TOUR.map((t, i) => html`<button class="tour-tab" type="button" role="tab" id="tour-tab-${t.key}" aria-controls="tour-${t.key}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${t.tab}<span class="tour-tab-progress" aria-hidden="true"></span></button>`);
  const slides = TOUR.map((t, i) => html`<div class="tour-slide" role="tabpanel" id="tour-${t.key}" aria-labelledby="tour-tab-${t.key}" data-slide>
      <figure class="tour-shot" style="--focus:${t.focus}">${shot(t.key, t.alt, i === 0)}</figure>
      <div class="tour-caption">
        <h3>${t.title}</h3>
        <p>${t.text}</p>
      </div>
    </div>`);

  const finalScale = raw(Array.from({ length: 11 }, (_, n) => `<span style="--i:${n}"${n >= 9 ? ' class="on"' : ''}>${n}</span>`).join(''));
  const demoEmail = raw(emailSnippet({ base: '', publicId: 'demo', question: 'How likely are you to recommend Copperline Coffee to a friend?' }));

  const body = html`
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-nav" data-nav>
  <div class="wrap nav-row">
    ${brand()}
    <nav class="nav-links" aria-label="Sections">
      <a href="#tour">Tour</a>
      <a href="#switch">Switching</a>
      <a href="#free">Free</a>
      <a href="#faq">FAQ</a>
    </nav>
    <div class="nav-cta">${themeToggle()}${authLinks}</div>
  </div>
</header>

<main id="main">
  <section class="hero wrap" data-hero>
    <div class="hero-copy">
      <h1>
        <span class="line" style="--l:0"><span>Ask one question.</span></span>
        <span class="line" style="--l:1"><span>Keep <span class="mark">every answer</span>.</span></span>
      </h1>
      <p class="lead">Free NPS surveys for small teams. Send them by link, email or site widget, then watch your score move.</p>
      <div class="hero-actions">
        <a class="btn btn-dark btn-lg" href="/signup">Start free ${icon('arrow-right')}</a>
        <a class="btn btn-line btn-lg" href="#tour">See the tour</a>
      </div>
    </div>

    <div class="hero-visual" data-demo>
      <form class="demo-card" style="--v:0" data-demo-form>
        <div class="demo-head">
          <span class="demo-brand">Copperline Coffee</span>
        </div>
        <fieldset class="scale-field">
          <legend class="demo-q">How likely are you to recommend Copperline Coffee to a friend?</legend>
          <div class="scale">${scaleInputs(null, 'demo')}</div>
          <div class="scale-ends" aria-hidden="true"><span>Not likely</span><span>Very likely</span></div>
        </fieldset>
        <div class="demo-follow" data-demo-follow hidden>
          <label for="demo-why">What's the main reason for your score?</label>
          <textarea id="demo-why" rows="2" maxlength="140" placeholder="Type anything. Nothing is saved."></textarea>
          <button class="btn btn-accent btn-sm demo-send" type="submit">Send</button>
        </div>
      </form>
      <div class="demo-score" style="--v:1">
        <span class="demo-score-label">NPS this month</span>
        <span class="demo-score-num" data-demo-nps>+34</span>
        <span class="demo-score-sub" data-demo-count>from 64 sample answers</span>
      </div>
      <div class="feed" style="--v:2">
        <ol class="feed-list" data-feed aria-label="Latest sample answers"></ol>
        <p class="sr-only" role="status" data-demo-status></p>
        <div class="feed-bar">
          <button class="feed-toggle" type="button" data-feed-toggle aria-pressed="false">Pause answers</button>
        </div>
      </div>
    </div>
  </section>

  <section class="section" id="tour">
    <div class="wrap">
      <div class="section-head" data-reveal>
        <p class="eyebrow">Product tour</p>
        <h2>See the whole loop.</h2>
        <p>Five screens from the app, filled with sample answers for a coffee shop we made up.</p>
      </div>
      <div class="tour" data-tour data-reveal>
        <div class="tour-bar">
          <div class="tour-tabs" role="tablist" aria-label="Product tour">${tabs}</div>
          <button class="tour-pause" type="button" data-tour-pause aria-pressed="false">${icon('pause')}<span>Pause</span></button>
        </div>
        <div class="tour-stage">
          <div class="tour-track" data-tour-track>${slides}</div>
          <div class="tour-arrows">
            <button class="tour-arrow" type="button" data-tour-prev aria-label="Previous screen">${icon('arrow-left')}</button>
            <button class="tour-arrow" type="button" data-tour-next aria-label="Next screen">${icon('arrow-right')}</button>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="section section-tint" id="switch">
    <div class="wrap switch">
      <div class="switch-copy" data-reveal>
        <h2>Leaving GetFeedback or Delighted?</h2>
        <p>Bring years of scores with you. Every answer keeps its original date, so your trend line doesn't start over.</p>
        <dl class="dates">
          <div class="date-card"><dt>Delighted</dt><dd>Closed<small>June 30, 2026</small></dd></div>
          <div class="date-card"><dt>GetFeedback</dt><dd>Retires<small>December 31, 2026</small></dd></div>
        </dl>
        <a class="btn btn-dark btn-lg" href="/signup">Start free ${icon('arrow-right')}</a>
      </div>

      <div class="checker" data-checker data-reveal>
        <div class="checker-head">
          <h3>Check your export</h3>
          <span class="checker-private">${icon('lock-simple')}Runs in your browser. Nothing is uploaded.</span>
        </div>
        <div class="drop" data-drop>
          ${icon('upload-simple')}
          <p><label for="check-file">Choose a CSV file</label> or drop it here</p>
          <input id="check-file" type="file" accept=".csv,text/csv" data-check-file>
        </div>
        <div class="drop-actions">
          <button class="btn btn-line btn-sm" type="button" data-check-sample>Try a sample file</button>
        </div>
        <div class="check-result" data-check-result hidden aria-live="polite"></div>
      </div>
    </div>
  </section>

  <section class="section" id="features">
    <div class="wrap">
      <div class="section-head" data-reveal>
        <h2>The small things that save time.</h2>
      </div>
      <div class="bento">
        <article class="cell cell-wide cell-brand" data-reveal>
          <div class="cell-copy">
            <h3>Your name and colour</h3>
            <p>Customers see your business name and button colour, not ours. Pick one to try it.</p>
            <div class="swatches" role="group" aria-label="Button colour">
              ${SWATCHES.map(([c, name], i) => html`<button class="swatch-btn" type="button" style="--sw:${c}" data-swatch="${c}" aria-pressed="${i === 0}" aria-label="${name}"></button>`)}
            </div>
          </div>
          <div class="mini-survey" data-brand-demo style="--brand:#1d7a50;--brand-ink:#ffffff" aria-hidden="true">
            <p class="respond-brand">Copperline Coffee</p>
            <p class="mini-q">How likely are you to recommend us to a friend?</p>
            <div class="scale scale-mini">${scaleInputs(9, 'brand-demo')}</div>
          </div>
        </article>
        <article class="cell cell-slack" data-reveal>
          ${icon('slack-logo', 'big-icon')}
          <div>
            <h3>Answers in Slack</h3>
            <p>Each new answer goes to the channel you pick, with the score, the reason and who sent it.</p>
          </div>
        </article>
        <article class="cell cell-export" data-reveal>
          ${icon('download-simple', 'icon big-icon')}
          <div>
            <h3>Export whenever you like</h3>
            <p>Every answer in one CSV, ready for a spreadsheet:</p>
            <ul class="col-chips" aria-label="Columns in the export">
              <li>date</li><li>score</li><li>group</li><li>comment</li><li>email</li><li>source</li>
            </ul>
          </div>
        </article>
        <article class="cell cell-wide cell-email" data-reveal>
          <div class="cell-copy">
            <h3>One click from an email</h3>
            <p>A row of plain HTML buttons that works in Gmail, Outlook and Apple Mail. Clicking a number records the score.</p>
          </div>
          <div class="email-paper" aria-hidden="true" inert>${demoEmail}</div>
        </article>
      </div>
    </div>
  </section>

  <section class="section" id="faq">
    <div class="wrap faq">
      <div class="faq-head" data-reveal>
        <h2>Questions before you switch.</h2>
      </div>
      <div class="faq-list" data-reveal>
        <details>
          <summary>Is it really free?${icon('plus')}</summary>
          <p>Yes. There are no paid plans, no card to enter and no limit on surveys or answers. Every feature on this page is included.</p>
        </details>
        <details>
          <summary>Which files can I import?${icon('plus')}</summary>
          <p>Any CSV with a column of scores from 0 to 10. Tenpoint looks for columns named like Score, Rating or NPS, plus Comment, Email and a date. Exports from GetFeedback and Delighted work as they are.</p>
        </details>
        <details>
          <summary>Do old answers keep their dates?${icon('plus')}</summary>
          <p>Yes. An answer from March 2023 shows up in March 2023, so your monthly trend goes back as far as your export does.</p>
        </details>
        <details>
          <summary>Can someone answer twice from one email?${icon('plus')}</summary>
          <p>Clicking a number records it once. If they then add a reason or change their score, the same answer is updated rather than counted again.</p>
        </details>
        <details>
          <summary>Do my customers need an account?${icon('plus')}</summary>
          <p>No. They tap a number and, if they want, type a reason.</p>
        </details>
        <details>
          <summary>Who owns the answers?${icon('plus')}</summary>
          <p>You do. Export everything as a CSV at any time. Deleting a survey deletes its answers, and deleting your account deletes everything.</p>
        </details>
      </div>
    </div>
  </section>

  <section class="final" id="free">
    <div class="final-scale" aria-hidden="true" data-reveal>${finalScale}</div>
    <div class="wrap final-copy">
      <h2 data-reveal>Everything is free.</h2>
      <p class="final-sub" data-reveal>No plans, no card and no cap on surveys or answers.</p>
      <ul class="included" aria-label="Included for free" data-reveal>
        ${INCLUDED.map((item) => html`<li>${icon('check')}${item}</li>`)}
      </ul>
      <a class="btn btn-dark btn-lg" href="/signup" data-reveal>Start free ${icon('arrow-right')}</a>
    </div>
  </section>
</main>

<footer class="site-foot">
  <div class="wrap foot-row">
    ${brand()}
    <span>Free, simple NPS surveys for small teams.</span>
    <nav class="foot-links" aria-label="Footer">
      <a href="#free">Free</a>
      <a href="#faq">FAQ</a>
      <a href="/login">Log in</a>
    </nav>
  </div>
</footer>`;

  return page({
    title: 'Tenpoint: free NPS surveys for small teams',
    description: 'Free NPS surveys for small teams. Ask customers one question, read every answer, and import your history from GetFeedback or Delighted.',
    body,
    bodyClass: 'landing',
    scripts: ['/landing.js'],
    blocking: ['/boot.js'],
  });
}

export const tourKeys = TOUR.map((t) => t.key);
