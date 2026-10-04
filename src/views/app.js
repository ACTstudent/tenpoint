import { html, raw, page, brand, icon, plural, fmtDate, fmtMonth, ago, signed, textOn } from '../html.js';
import { group } from '../nps.js';
import { emailSnippet, widgetSnippet, surveyUrl } from '../snippet.js';
import { scaleInputs } from './survey.js';

const GROUP_LABEL = { promoter: 'Promoters', passive: 'Passives', detractor: 'Detractors' };
const SOURCE_LABEL = { link: 'Link', email: 'Email', widget: 'Widget', import: 'Import' };
const RANGES = [['30', '30 days'], ['90', '90 days'], ['365', '12 months'], ['all', 'All time']];

function shell({ user, title, body, scripts = [] }) {
  const content = html`
<a class="skip-link" href="#main">Skip to content</a>
<header class="app-bar">
  <div class="app-bar-row">
    ${brand('/app')}
    <nav class="app-nav" aria-label="Account">
      <a href="/app">Surveys</a>
      <a href="/app/account">${user.email}</a>
      <form method="post" action="/logout"><button class="link-btn" type="submit">${icon('sign-out')}<span>Log out</span></button></form>
    </nav>
  </div>
</header>
<main id="main" class="app-main">${body}</main>`;
  return page({ title: `${title} | Tenpoint`, body: content, bodyClass: 'page-app', scripts: ['/app.js', ...scripts] });
}

function flashBox(flash) {
  if (!flash) return '';
  return html`<p class="flash flash-${flash.kind || 'ok'}" role="status">${flash.kind === 'error' ? icon('warning-circle') : icon('check')}<span>${flash.text}</span></p>`;
}

function npsTone(n) {
  if (n === null) return 'none';
  return n >= 30 ? 'good' : n >= 0 ? 'mid' : 'low';
}

// Overview

export function overviewPage({ user, surveys, flash }) {
  const cards = surveys.map((s) => html`
    <li>
      <a class="survey-card" href="/app/surveys/${s.id}">
        <span class="survey-card-head">
          <span class="survey-card-name">${s.name}</span>
          ${s.brand ? html`<span class="survey-card-brand">${s.brand}</span>` : ''}
        </span>
        <span class="survey-card-score tone-${npsTone(s.recent.nps)}">${s.recent.nps === null ? 'No score yet' : signed(s.recent.nps)}</span>
        <span class="survey-card-meta">${s.recent.nps === null ? 'Nothing in the last 90 days' : `NPS, last 90 days, from ${plural(s.recent.total, 'answer')}`}</span>
        <span class="survey-card-foot">${plural(s.total, 'answer')} in total${s.last ? `. Last one ${ago(s.last)}` : ''}</span>
      </a>
    </li>`);

  const createForm = html`
    <form class="new-survey" method="post" action="/app/surveys">
      <h2>${surveys.length ? 'New survey' : 'Create your first survey'}</h2>
      ${surveys.length ? '' : html`<p class="muted">Name it, add the business name your customers know, and you'll get a link, email buttons and a widget straight away.</p>`}
      <div class="field">
        <label for="new-name">Survey name</label>
        <input id="new-name" name="name" required maxlength="80" value="${surveys.length ? '' : 'Customer NPS'}" aria-describedby="new-name-hint">
        <p class="hint" id="new-name-hint">Only you see this.</p>
      </div>
      <div class="field">
        <label for="new-brand">Business name</label>
        <input id="new-brand" name="brand" required maxlength="60" autocomplete="organization" aria-describedby="new-brand-hint">
        <p class="hint" id="new-brand-hint">Used in the question: “How likely are you to recommend <i>this name</i>…”</p>
      </div>
      <button class="btn btn-dark" type="submit">${icon('plus')}<span>Create survey</span></button>
    </form>`;

  const body = html`
  <div class="app-wrap">
    ${flashBox(flash)}
    ${surveys.length ? html`
      <div class="page-head"><h1>Surveys</h1></div>
      <div class="overview">
        <ul class="survey-grid" role="list">${cards}</ul>
        ${createForm}
      </div>` : html`<div class="first-run">${createForm}</div>`}
  </div>`;
  return shell({ user, title: 'Surveys', body });
}

// Survey pages share a header with tabs.

function surveyFrame({ user, survey, tab, base, body, scripts }) {
  const tabs = [['results', 'Results', ''], ['share', 'Share', '/share'], ['import', 'Import', '/import'], ['settings', 'Settings', '/settings']];
  const content = html`
  <div class="app-wrap">
    <div class="survey-head">
      <div>
        <a class="back-link" href="/app">${icon('arrow-left')}<span>All surveys</span></a>
        <h1>${survey.name}</h1>
      </div>
      <a class="btn btn-line btn-sm" href="${surveyUrl(base, survey.public_id)}" target="_blank" rel="noopener">${icon('link')}<span>Open survey</span></a>
    </div>
    <nav class="tabs" aria-label="Survey">
      ${tabs.map(([key, label, path]) => html`<a href="/app/surveys/${survey.id}${path}"${key === tab ? raw(' aria-current="page"') : ''}>${label}</a>`)}
    </nav>
    ${body}
  </div>`;
  return shell({ user, title: survey.name, body: content, scripts });
}

function qs(params, overrides) {
  const p = new URLSearchParams();
  const all = { ...params, ...overrides };
  for (const [k, v] of Object.entries(all)) if (v !== undefined && v !== null && v !== '' && v !== false) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}

function trendChart(trend) {
  const W = 640, H = 220, top = 16, bottom = 28, left = 36;
  const plotH = H - top - bottom;
  const y = (v) => top + ((100 - v) / 200) * plotH;
  const step = (W - left) / trend.length;
  const barW = Math.min(30, step * 0.56);
  const guides = [100, 50, 0, -50, -100].map((v) => `<g class="guide${v === 0 ? ' guide-zero' : ''}"><line x1="${left}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${left - 8}" y="${y(v) + 4}">${v > 0 ? '+' + v : v}</text></g>`).join('');
  const bars = trend.map((m, i) => {
    const cx = left + step * i + step / 2;
    const label = `<text class="month" x="${cx}" y="${H - 8}">${fmtMonth(m.month).slice(0, 3)}</text>`;
    if (m.nps === null) return `<g><circle class="empty" cx="${cx}" cy="${y(0)}" r="2.5"><title>${fmtMonth(m.month)}: no answers</title></circle>${label}</g>`;
    const y0 = y(0), y1 = y(m.nps);
    const h = Math.max(2, Math.abs(y1 - y0));
    const yTop = m.nps >= 0 ? y0 - h : y0;
    return `<g><rect class="${m.nps >= 0 ? 'pos' : 'neg'}" x="${cx - barW / 2}" y="${yTop}" width="${barW}" height="${h}" rx="4"><title>${fmtMonth(m.month)}: NPS ${signed(m.nps)} from ${plural(m.total, 'answer')}</title></rect>${label}</g>`;
  }).join('');
  const withData = trend.filter((m) => m.nps !== null);
  const desc = withData.length
    ? `NPS by month. ${withData.map((m) => `${fmtMonth(m.month)} ${signed(m.nps)}`).join(', ')}.`
    : 'No answers in the last 12 months.';
  return raw(`<svg class="trend-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${desc}">${guides}${bars}</svg>`);
}

function distribution(counts, total) {
  const max = Math.max(1, ...counts);
  return html`<ol class="dist" aria-label="Answers for each score">
    ${counts.map((c, n) => html`<li class="g-${group(n)}" title="${plural(c, 'answer')} scored ${n}">
      <span class="dist-count">${c}</span>
      <span class="dist-bar" style="--h:${Math.round((c / max) * 100)}%"></span>
      <span class="dist-n">${n}</span>
    </li>`)}
  </ol>${total ? '' : html`<p class="muted small">No answers in this period.</p>`}`;
}

export function resultsPage({ user, survey, base, stats, prev, trend, counts, list, filters, page: pg, perPage, flash }) {
  const params = { range: filters.range === '90' ? '' : filters.range, group: filters.group, source: filters.source, comments: filters.withComment ? '1' : '' };
  const delta = stats.nps !== null && prev && prev.nps !== null ? stats.nps - prev.nps : null;
  const rangeName = RANGES.find(([k]) => k === filters.range)?.[1] || '90 days';

  if (survey.totalAll === 0) {
    const body = html`
      ${flashBox(flash)}
      <section class="empty-state">
        ${icon('chat-circle-text', 'icon empty-icon')}
        <h2>No answers yet</h2>
        <p>Send the link to a few customers, put the buttons in your next email, or bring in your old answers from another tool.</p>
        <div class="copy-row">
          <label class="sr-only" for="empty-link">Survey link</label>
          <input id="empty-link" readonly value="${surveyUrl(base, survey.public_id)}" data-copy-source>
          <button class="btn btn-dark btn-sm" type="button" data-copy>${icon('copy')}<span>Copy link</span></button>
        </div>
        <p class="empty-links"><a href="/app/surveys/${survey.id}/share">More ways to share</a><a href="/app/surveys/${survey.id}/import">Import old answers</a></p>
      </section>`;
    return surveyFrame({ user, survey, tab: 'results', base, body });
  }

  const rows = list.rows.map((r) => {
    const g = group(r.score);
    return html`<li class="answer">
      <span class="score-chip g-${g}" aria-label="Score ${r.score}, ${GROUP_LABEL[g].slice(0, -1).toLowerCase()}">${r.score}</span>
      <div class="answer-body">
        ${r.comment ? html`<p class="answer-text">${r.comment}</p>` : html`<p class="answer-text muted">No comment</p>`}
        <p class="answer-meta"><time datetime="${r.created_at}" title="${fmtDate(r.created_at)}">${r.source === 'import' ? fmtDate(r.created_at) : ago(r.created_at)}</time><span>${SOURCE_LABEL[r.source] || r.source}</span>${r.email ? html`<span>${r.email}</span>` : ''}</p>
      </div>
    </li>`;
  });

  const pages = Math.max(1, Math.ceil(list.total / perPage));
  const body = html`
    ${flashBox(flash)}
    <div class="range-row">
      <nav class="segmented" aria-label="Time period">
        ${RANGES.map(([k, label]) => html`<a href="${qs(params, { range: k === '90' ? '' : k, page: '' })}"${k === filters.range ? raw(' aria-current="true"') : ''}>${label}</a>`)}
      </nav>
      <a class="btn btn-line btn-sm" href="/app/surveys/${survey.id}/export.csv">${icon('download-simple')}<span>Export CSV</span></a>
    </div>

    <section class="results-top" aria-label="Summary">
      <div class="score-block">
        <p class="score-label">NPS, ${rangeName.toLowerCase()}</p>
        <p class="score-num tone-${npsTone(stats.nps)}">${stats.nps === null ? 'No answers' : signed(stats.nps)}</p>
        <p class="score-sub">${plural(stats.total, 'answer')}${delta !== null ? html`<span class="delta ${delta >= 0 ? 'up' : 'down'}">${delta === 0 ? 'Same as' : `${signed(delta)} vs`} the ${rangeName} before</span>` : ''}</p>
      </div>
      <div class="split-block">
        <div class="split-bar" aria-hidden="true">
          ${['promoter', 'passive', 'detractor'].map((g) => stats.counts[g] ? html`<i class="g-${g}" style="flex-grow:${stats.counts[g]}"></i>` : '')}
        </div>
        <dl class="split-legend">
          ${['promoter', 'passive', 'detractor'].map((g) => html`<div>
            <dt><i class="swatch g-${g}"></i>${GROUP_LABEL[g]}<small>${g === 'promoter' ? '9 to 10' : g === 'passive' ? '7 to 8' : '0 to 6'}</small></dt>
            <dd>${stats.pct[g]}%<small>${stats.counts[g].toLocaleString('en-US')}</small></dd>
          </div>`)}
        </dl>
      </div>
    </section>

    <div class="charts">
      <section class="panel">
        <h2 class="panel-title">Last 12 months</h2>
        ${trendChart(trend)}
      </section>
      <section class="panel">
        <h2 class="panel-title">Scores, ${rangeName.toLowerCase()}</h2>
        ${distribution(counts, stats.total)}
      </section>
    </div>

    <section class="panel answers" aria-labelledby="answers-title">
      <div class="answers-head">
        <h2 class="panel-title" id="answers-title">Answers <span class="count">${list.total.toLocaleString('en-US')}</span></h2>
        <form class="filters" method="get" data-autosubmit>
          ${filters.range !== '90' ? html`<input type="hidden" name="range" value="${filters.range}">` : ''}
          <nav class="chips" aria-label="Filter by group">
            ${[['', 'All'], ['promoter', 'Promoters'], ['passive', 'Passives'], ['detractor', 'Detractors']].map(([g, label]) =>
              html`<a class="chip-link${g ? ` g-${g}` : ''}" href="${qs(params, { group: g, page: '' })}"${(filters.group || '') === g ? raw(' aria-current="true"') : ''}>${label}</a>`)}
          </nav>
          ${filters.group ? html`<input type="hidden" name="group" value="${filters.group}">` : ''}
          <label class="sr-only" for="f-source">Source</label>
          <select id="f-source" name="source">
            <option value="">All sources</option>
            ${Object.entries(SOURCE_LABEL).map(([k, label]) => html`<option value="${k}"${filters.source === k ? raw(' selected') : ''}>${label}</option>`)}
          </select>
          <label class="check"><input type="checkbox" name="comments" value="1"${filters.withComment ? raw(' checked') : ''}><span>With comments</span></label>
          <noscript><button class="btn btn-line btn-sm" type="submit">Apply</button></noscript>
        </form>
      </div>
      ${rows.length ? html`<ol class="answer-list">${rows}</ol>` : html`<p class="muted answers-empty">No answers match these filters.</p>`}
      ${pages > 1 ? html`<nav class="pager" aria-label="Pages">
        ${pg > 1 ? html`<a class="btn btn-line btn-sm" href="${qs(params, { page: pg - 1 === 1 ? '' : pg - 1 })}">Newer</a>` : html`<span></span>`}
        <span class="muted">Page ${pg} of ${pages}</span>
        ${pg < pages ? html`<a class="btn btn-line btn-sm" href="${qs(params, { page: pg + 1 })}">Older</a>` : html`<span></span>`}
      </nav>` : ''}
    </section>`;
  return surveyFrame({ user, survey, tab: 'results', base, body });
}

export function sharePage({ user, survey, base, flash }) {
  const link = surveyUrl(base, survey.public_id);
  const snippet = emailSnippet({ base, publicId: survey.public_id, question: survey.question });
  const widget = widgetSnippet({ base, publicId: survey.public_id });
  const body = html`
    ${flashBox(flash)}
    <div class="share-grid">
      <section class="panel share-link">
        <h2 class="panel-title">${icon('link')}Link</h2>
        <p class="muted">Paste it into receipts, support replies, text messages or a QR code.</p>
        <div class="copy-row">
          <label class="sr-only" for="share-link">Survey link</label>
          <input id="share-link" readonly value="${link}" data-copy-source>
          <button class="btn btn-dark btn-sm" type="button" data-copy>${icon('copy')}<span>Copy</span></button>
        </div>
      </section>

      <section class="panel share-widget">
        <h2 class="panel-title">${icon('code')}Widget for your site</h2>
        <p class="muted">Add this before the closing &lt;/body&gt; tag. The card appears after 5 seconds and stays away for 90 days once someone answers or closes it.</p>
        <div class="code-box">
          <label class="sr-only" for="widget-code">Widget code</label>
          <textarea id="widget-code" readonly rows="2" spellcheck="false" data-copy-source>${widget}</textarea>
          <button class="btn btn-dark btn-sm" type="button" data-copy>${icon('copy')}<span>Copy</span></button>
        </div>
        <a class="text-link" href="/s/${survey.public_id}/preview" target="_blank" rel="noopener">Try it on a test page</a>
      </section>

      <section class="panel share-email" data-email-builder data-base="${base}" data-public-id="${survey.public_id}" data-question="${survey.question}">
        <h2 class="panel-title">${icon('envelope-simple')}Buttons for your emails</h2>
        <p class="muted">Clicking a number records the score straight away, then opens a page where they can add a reason. Paste the HTML into your email tool's code or HTML block.</p>
        <div class="email-preview" aria-label="Preview of the email buttons">
          <div class="email-paper" data-email-preview>${raw(snippet)}</div>
        </div>
        <div class="field">
          <label for="merge-tag">Recipient email merge tag</label>
          <input id="merge-tag" placeholder="*|EMAIL|*" spellcheck="false" autocomplete="off" data-merge-tag aria-describedby="merge-hint">
          <p class="hint" id="merge-hint">Optional. Use your email tool's tag for the recipient's address, like <code>*|EMAIL|*</code> in Mailchimp or <code>{{contact.email}}</code> in HubSpot, to see who answered.</p>
        </div>
        <div class="code-box">
          <label class="sr-only" for="email-code">Email HTML</label>
          <textarea id="email-code" readonly rows="6" spellcheck="false" data-copy-source data-email-code>${snippet}</textarea>
          <button class="btn btn-dark btn-sm" type="button" data-copy>${icon('copy')}<span>Copy HTML</span></button>
        </div>
      </section>
    </div>`;
  return surveyFrame({ user, survey, tab: 'share', base, body, scripts: ['/share.js'] });
}

export function importPage({ user, survey, base, imports, flash, error }) {
  const past = imports.map((i) => html`<li class="import-row">
    <div>
      <p class="import-name">${i.file_name || 'Pasted CSV'}</p>
      <p class="muted small">${plural(i.row_count, 'answer')}${i.first_at ? `, ${fmtDate(i.first_at)} to ${fmtDate(i.last_at)}` : ''}. Imported ${ago(i.created_at)}.</p>
    </div>
    <form method="post" action="/app/surveys/${survey.id}/imports/${i.id}/undo" data-confirm="Remove the ${plural(i.row_count, 'answer')} from this import?">
      <button class="btn btn-line btn-sm" type="submit">${icon('trash')}<span>Undo</span></button>
    </form>
  </li>`);

  const body = html`
    ${flashBox(flash)}
    <div class="import-grid">
      <form class="panel import-form" method="post" action="/app/surveys/${survey.id}/import" data-import>
        <h2 class="panel-title">${icon('upload-simple')}Import answers from a CSV</h2>
        <p class="muted">Export your responses from GetFeedback, Delighted or a spreadsheet. Tenpoint finds the score, comment, email and date columns, and each answer keeps its original date.</p>
        ${error ? html`<p class="form-error" role="alert">${error}</p>` : ''}
        <div class="field">
          <label for="csv-file">CSV file</label>
          <input id="csv-file" type="file" accept=".csv,text/csv" data-csv-file>
        </div>
        <details class="paste" data-paste>
          <summary>Or paste the CSV instead</summary>
          <div class="field">
            <label for="csv">CSV contents</label>
            <textarea id="csv" name="csv" rows="6" spellcheck="false" data-csv></textarea>
          </div>
        </details>
        <input type="hidden" name="file_name" data-file-name>
        <div class="import-preview" data-import-preview hidden aria-live="polite"></div>
        <button class="btn btn-dark" type="submit" data-import-submit>Import answers</button>
      </form>
      <aside class="panel import-help">
        <h2 class="panel-title">What it looks for</h2>
        <dl class="map-list">
          <div><dt>Score</dt><dd>A column called Score, Rating or NPS, holding whole numbers from 0 to 10. Required.</dd></div>
          <div><dt>Comment</dt><dd>Comment, Feedback or Reason.</dd></div>
          <div><dt>Email</dt><dd>Any column with "email" in its name.</dd></div>
          <div><dt>Date</dt><dd>Created at, Date, Submitted or a timestamp. Without one, answers are dated today.</dd></div>
        </dl>
        <p class="muted small">Rows without a valid score are skipped. Importing the same file twice is blocked, and every import can be undone.</p>
      </aside>
    </div>
    ${imports.length ? html`<section class="panel">
      <h2 class="panel-title">Past imports</h2>
      <ul class="import-list" role="list">${past}</ul>
    </section>` : ''}`;
  return surveyFrame({ user, survey, tab: 'import', base, body, scripts: ['/import.js'] });
}

export function settingsPage({ user, survey, base, values, flash, error }) {
  const v = values || {
    name: survey.name, brand: survey.brand, question: survey.question, followUp: survey.follow_up,
    color: survey.color, slackWebhook: survey.slack_webhook,
  };
  const body = html`
    ${flashBox(flash)}
    <div class="settings-grid">
      <form class="panel settings-form" method="post" action="/app/surveys/${survey.id}/settings">
        <h2 class="panel-title">Survey</h2>
        ${error ? html`<p class="form-error" role="alert">${error}</p>` : ''}
        <div class="field">
          <label for="s-name">Survey name</label>
          <input id="s-name" name="name" required maxlength="80" value="${v.name}">
        </div>
        <div class="field">
          <label for="s-brand">Business name</label>
          <input id="s-brand" name="brand" maxlength="60" value="${v.brand}" data-preview-brand>
        </div>
        <div class="field">
          <label for="s-question">Question</label>
          <textarea id="s-question" name="question" rows="2" required maxlength="200" data-preview-question>${v.question}</textarea>
        </div>
        <div class="field">
          <label for="s-follow">Follow-up question</label>
          <input id="s-follow" name="followUp" required maxlength="140" value="${v.followUp}">
          <p class="hint">Shown after someone picks a score.</p>
        </div>
        <div class="field">
          <label for="s-color">Button colour</label>
          <div class="color-row">
            <input id="s-color" name="color" type="color" value="${v.color}" data-color>
            <input aria-label="Button colour as a hex code" value="${v.color}" maxlength="7" spellcheck="false" data-color-text>
          </div>
        </div>
        <div class="field">
          <label for="s-slack">Slack webhook URL</label>
          <input id="s-slack" name="slackWebhook" type="url" inputmode="url" spellcheck="false" placeholder="https://hooks.slack.com/services/…" value="${v.slackWebhook}" aria-describedby="slack-hint">
          <p class="hint" id="slack-hint">Optional. Each new answer is posted to the channel. Create one under Slack's Incoming Webhooks app.</p>
        </div>
        <button class="btn btn-dark" type="submit">Save changes</button>
      </form>

      <div class="settings-side">
        <section class="panel">
          <h2 class="panel-title">Preview</h2>
          <div class="mini-survey" style="--brand:${survey.color};--brand-ink:${textOn(survey.color)}" data-mini-survey aria-hidden="true">
            <p class="respond-brand" data-mini-brand>${survey.brand}</p>
            <p class="mini-q" data-mini-question>${survey.question}</p>
            <div class="scale scale-mini">${scaleInputs(9, 'preview')}</div>
          </div>
        </section>
        ${survey.slack_webhook ? html`<form class="panel" method="post" action="/app/surveys/${survey.id}/slack-test">
          <h2 class="panel-title">${icon('slack-logo')}Slack</h2>
          <p class="muted">Send a sample answer to check the channel is right.</p>
          <button class="btn btn-line btn-sm" type="submit">Send a test message</button>
        </form>` : ''}
        <form class="panel danger" method="post" action="/app/surveys/${survey.id}/delete">
          <h2 class="panel-title">Delete survey</h2>
          <p class="muted">Deletes the survey${survey.totalAll ? ` and all ${plural(survey.totalAll, 'answer')}` : ''}. Links, email buttons and widgets stop working. This can't be undone.</p>
          <label class="check"><input type="checkbox" name="confirm" value="yes" required><span>I understand</span></label>
          <button class="btn btn-danger btn-sm" type="submit">${icon('trash')}<span>Delete survey</span></button>
        </form>
      </div>
    </div>`;
  return surveyFrame({ user, survey, tab: 'settings', base, body });
}

export function accountPage({ user, error }) {
  const body = html`
  <div class="app-wrap narrow">
    <div class="page-head"><h1>Account</h1></div>
    <section class="panel">
      <h2 class="panel-title">Signed in as</h2>
      <p>${user.email}</p>
    </section>
    <form class="panel danger" method="post" action="/app/account/delete">
      <h2 class="panel-title">Delete account</h2>
      <p class="muted">Deletes your account, every survey and every answer. Export anything you want to keep first.</p>
      ${error ? html`<p class="form-error" role="alert">${error}</p>` : ''}
      <div class="field">
        <label for="del-password">Your password</label>
        <input id="del-password" name="password" type="password" autocomplete="current-password" required>
      </div>
      <button class="btn btn-danger btn-sm" type="submit">${icon('trash')}<span>Delete my account</span></button>
    </form>
  </div>`;
  return shell({ user, title: 'Account', body });
}

export function notFoundPage({ user } = {}) {
  const body = html`
  <main class="auth">
    <div class="auth-top">${brand(user ? '/app' : '/')}</div>
    <div class="auth-card">
      <h1>Page not found</h1>
      <p class="auth-sub">The link may be wrong, or the survey was deleted.</p>
      <a class="btn btn-dark btn-block" href="${user ? '/app' : '/'}">${user ? 'Back to surveys' : 'Go to the home page'}</a>
    </div>
  </main>`;
  return page({ title: 'Page not found | Tenpoint', body, bodyClass: 'page-auth' });
}

export function errorPage() {
  const body = html`
  <main class="auth">
    <div class="auth-top">${brand()}</div>
    <div class="auth-card">
      <h1>Something went wrong</h1>
      <p class="auth-sub">That one is on us. Please try again in a moment.</p>
      <a class="btn btn-dark btn-block" href="/">Go to the home page</a>
    </div>
  </main>`;
  return page({ title: 'Error | Tenpoint', body, bodyClass: 'page-auth' });
}
