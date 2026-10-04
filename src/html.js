// Tiny HTML helpers. Every value goes through esc() unless it is markup we built ourselves (raw()).

const RAW = Symbol('raw');

export function raw(s) {
  return { [RAW]: String(s) };
}

export function esc(v) {
  if (v && v[RAW] !== undefined) return v[RAW];
  if (Array.isArray(v)) return v.map(esc).join('');
  if (v === null || v === undefined || v === false) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Tagged template: html`<p>${value}</p>` escapes interpolations and returns raw markup.
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += esc(values[i]) + strings[i + 1];
  return raw(out);
}

let assetVersion = 'dev';
export function setAssetVersion(v) {
  assetVersion = v;
}
export const asset = (path) => `${path}?v=${assetVersion}`;

export function icon(name, cls = 'icon') {
  return raw(`<svg class="${cls}" aria-hidden="true" focusable="false"><use href="${asset('/icons.svg')}#i-${name}"></use></svg>`);
}

// The mark: eleven ticks for the 0 to 10 scale, the last two raised.
export const logo = raw(`<svg class="logo-mark" viewBox="0 0 43 22" aria-hidden="true" focusable="false">${
  Array.from({ length: 11 }, (_, i) => {
    const h = i >= 9 ? 22 : 7 + i * 0.7;
    return `<rect x="${i * 4}" y="${(22 - h).toFixed(1)}" width="2.6" height="${h.toFixed(1)}" rx="1.3"${i >= 9 ? ' class="tick-on"' : ''}/>`;
  }).join('')
}</svg>`);

export function brand(href = '/') {
  return html`<a class="brand" href="${href}" aria-label="Tenpoint home">${logo}<span>Tenpoint</span></a>`;
}

// Customer-facing survey pages pass themed: false so they always show the business's light design.
export function page({ title, description = '', body, bodyClass = '', scripts = [], blocking = [], preload = [], themed = true }) {
  const fonts = ['/fonts/geist.woff2', '/fonts/bricolage.woff2', ...preload];
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${description ? `<meta name="description" content="${esc(description)}">` : ''}
<meta name="theme-color" content="#f4f5f2">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
${fonts.map((f) => `<link rel="preload" href="${f}" as="font" type="font/woff2" crossorigin>`).join('\n')}
<link rel="stylesheet" href="${asset('/styles.css')}">
${(themed ? ['/theme.js', ...blocking] : blocking).map((s) => `<script src="${asset(s)}"></script>`).join('\n')}
${scripts.map((s) => `<script type="module" src="${asset(s)}"></script>`).join('\n')}
</head>
<body class="${esc(bodyClass)}">
${esc(body)}
</body>
</html>`;
}

export function plural(n, one, many = `${one}s`) {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(iso) {
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export function fmtMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function ago(iso, from = Date.now()) {
  const s = Math.max(0, Math.round((from - Date.parse(iso)) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} ${d === 1 ? 'day' : 'days'} ago`;
  return fmtDate(iso);
}

export function signed(n) {
  if (n === null || n === undefined) return 'n/a';
  return n > 0 ? `+${n}` : String(n);
}

// Picks dark or light text for a background colour (WCAG relative luminance).
export function textOn(hex) {
  const v = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(v.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? '#111413' : '#ffffff';
}

export function themeToggle() {
  return raw(`<button class="theme-toggle" type="button" data-theme-toggle aria-pressed="false" aria-label="Switch to dark mode">${esc(icon('moon', 'icon i-moon'))}${esc(icon('sun', 'icon i-sun'))}</button>`);
}
