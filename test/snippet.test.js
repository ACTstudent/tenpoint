import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emailSnippet, widgetSnippet } from '../src/snippet.js';

test('email buttons link each score to the survey and escape the question', () => {
  const html = emailSnippet({ base: 'https://t.example', publicId: 'abc123', question: 'Rate <Acme> & "friends"' });
  for (let n = 0; n <= 10; n++) assert.ok(html.includes(`href="https://t.example/s/abc123?score=${n}&amp;src=email"`), String(n));
  assert.ok(html.includes('Rate &lt;Acme&gt; &amp; &quot;friends&quot;'));
  assert.ok(!html.includes('<Acme>'));
});

test('merge tags are kept as typed but cannot break out of the attribute', () => {
  const html = emailSnippet({ base: 'https://t.example', publicId: 'abc123', question: 'Q', mergeTag: '*|EMAIL|*' });
  assert.ok(html.includes('&amp;email=*|EMAIL|*"'));
  const evil = emailSnippet({ base: 'https://t.example', publicId: 'abc123', question: 'Q', mergeTag: '"><script>alert(1)</script>' });
  assert.ok(!evil.includes('<script>'));
  // Quotes and brackets are stripped, so the tag stays inside the href.
  assert.ok(evil.includes('&amp;email=scriptalert(1)/script"'));
});

test('widget snippet points at the host', () => {
  assert.equal(widgetSnippet({ base: 'https://t.example', publicId: 'abc' }), '<script src="https://t.example/widget.js" data-survey="abc" async></script>');
});
