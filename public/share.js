import { emailSnippet } from '/lib/snippet.js';

// Rebuilds the email buttons when a merge tag is typed, so the copied HTML records who answered.
const box = document.querySelector('[data-email-builder]');
if (box) {
  const tag = box.querySelector('[data-merge-tag]');
  const preview = box.querySelector('[data-email-preview]');
  const code = box.querySelector('[data-email-code]');
  tag.addEventListener('input', () => {
    const html = emailSnippet({ base: box.dataset.base, publicId: box.dataset.publicId, question: box.dataset.question, mergeTag: tag.value });
    code.value = html;
    // The snippet escapes the question and strips quotes and brackets from the tag, so it is safe to render.
    preview.innerHTML = html;
  });
}
