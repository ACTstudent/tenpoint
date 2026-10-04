// Small helpers shared by the signed-in pages.

// Copy buttons copy the nearest field marked data-copy-source.
document.querySelectorAll('[data-copy]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const source = btn.parentElement.querySelector('[data-copy-source]');
    if (!source) return;
    const label = btn.querySelector('span');
    const before = label ? label.textContent : '';
    try {
      await navigator.clipboard.writeText(source.value);
    } catch {
      source.select();
      document.execCommand('copy');
    }
    btn.classList.add('is-copied');
    if (label) label.textContent = 'Copied';
    setTimeout(() => { btn.classList.remove('is-copied'); if (label) label.textContent = before; }, 1600);
  });
});

// Filter forms apply as soon as a select or checkbox changes.
document.querySelectorAll('form[data-autosubmit]').forEach((form) => {
  form.addEventListener('change', () => form.requestSubmit ? form.requestSubmit() : form.submit());
});

document.querySelectorAll('form[data-confirm]').forEach((form) => {
  form.addEventListener('submit', (e) => {
    if (!window.confirm(form.dataset.confirm)) e.preventDefault();
  });
});

// Settings: keep the colour picker and hex field in step, and update the preview as you type.
const mini = document.querySelector('[data-mini-survey]');
const colorInput = document.querySelector('[data-color]');
const colorText = document.querySelector('[data-color-text]');
const inkFor = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? '#111413' : '#ffffff';
};
const paint = (hex) => {
  if (!mini || !/^#[0-9a-f]{6}$/i.test(hex)) return;
  mini.style.setProperty('--brand', hex);
  mini.style.setProperty('--brand-ink', inkFor(hex));
};
if (colorInput && colorText) {
  colorInput.addEventListener('input', () => { colorText.value = colorInput.value; paint(colorInput.value); });
  colorText.addEventListener('input', () => {
    const v = colorText.value.trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) { colorInput.value = v.toLowerCase(); paint(v); }
  });
}
const bindText = (inputSel, targetSel) => {
  const input = document.querySelector(inputSel);
  const target = document.querySelector(targetSel);
  if (input && target) input.addEventListener('input', () => { target.textContent = input.value; });
};
bindText('[data-preview-brand]', '[data-mini-brand]');
bindText('[data-preview-question]', '[data-mini-question]');
