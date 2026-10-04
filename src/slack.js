import { group } from './nps.js';

export function validSlackWebhook(url) {
  return /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+$/.test(url);
}

const LABEL = { promoter: 'Promoter', passive: 'Passive', detractor: 'Detractor' };

// Slack's mrkdwn treats &, < and > as control characters.
const slackText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function slackMessage(survey, response, { kind = 'new', link } = {}) {
  const g = group(response.score);
  const head = kind === 'comment'
    ? `New comment on a *${response.score}* (${LABEL[g]}) for ${slackText(survey.name)}`
    : `New answer: *${response.score}* (${LABEL[g]}) for ${slackText(survey.name)}`;
  const lines = [head];
  if (response.comment) lines.push(`> ${slackText(response.comment).replace(/\n/g, '\n> ')}`);
  if (response.email) lines.push(`From ${slackText(response.email)}`);
  if (link) lines.push(`<${link}|Open results>`);
  return { text: lines.join('\n') };
}

// Fire and forget. A slow or broken webhook never holds up the person answering.
export async function postToSlack(url, payload, { fetchImpl = fetch, timeoutMs = 4000 } = {}) {
  if (!url || !validSlackWebhook(url)) return false;
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}
