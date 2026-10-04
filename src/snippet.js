// Builds the code people paste into their own tools. Runs on the server and in the browser.

const escHtml = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

export function surveyUrl(base, publicId) {
  return `${base}/s/${publicId}`;
}

// A row of 0 to 10 buttons built from a table and inline styles, which is what email clients render reliably.
// mergeTag is the email tool's placeholder for the recipient's address, e.g. *|EMAIL|*, and is kept as typed.
export function emailSnippet({ base, publicId, question, mergeTag = '' }) {
  const tag = String(mergeTag).trim().replace(/["<>\s]/g, '');
  const href = (n) => escHtml(`${surveyUrl(base, publicId)}?score=${n}&src=email${tag ? `&email=${tag}` : ''}`);
  const font = "font-family:Arial,Helvetica,sans-serif";
  const cells = Array.from({ length: 11 }, (_, n) =>
    `<td style="padding:0 2px"><a href="${href(n)}" style="display:block;width:34px;height:34px;line-height:34px;text-align:center;border-radius:8px;border:1px solid #cfd5cf;background:#f4f5f2;color:#111413;${font};font-size:15px;font-weight:bold;text-decoration:none">${n}</a></td>`
  ).join('');
  return [
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">',
    `<tr><td colspan="11" style="padding:0 2px 12px;${font};font-size:16px;line-height:1.4;color:#111413">${escHtml(question)}</td></tr>`,
    `<tr>${cells}</tr>`,
    `<tr><td colspan="5" style="padding:8px 2px 0;${font};font-size:12px;color:#5b625e">Not likely</td><td colspan="6" align="right" style="padding:8px 2px 0;${font};font-size:12px;color:#5b625e">Very likely</td></tr>`,
    '</table>',
  ].join('\n');
}

export function widgetSnippet({ base, publicId }) {
  return `<script src="${base}/widget.js" data-survey="${publicId}" async></script>`;
}
