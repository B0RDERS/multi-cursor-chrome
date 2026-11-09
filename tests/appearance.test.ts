import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textareaPreferenceCSS } from '../src/editor/textarea-preferences.ts';

test('disabled preferences leave all native textarea styles intact', () => {
  assert.equal(textareaPreferenceCSS({ monospace: false, noWrap: false }), '');
});
test('font and wrapping preferences can be enabled independently', () => {
  const font = textareaPreferenceCSS({ monospace: true, noWrap: false });
  assert.match(font, /font-family:.*monospace!important/);
  assert.doesNotMatch(font, /white-space/);
  const wrapping = textareaPreferenceCSS({ monospace: false, noWrap: true });
  assert.match(wrapping, /white-space:pre!important/);
  assert.match(wrapping, /overflow-x:auto!important/);
  assert.match(
    wrapping,
    /::-webkit-scrollbar-corner\{background-color:transparent;\}/,
  );
  assert.doesNotMatch(wrapping, /::-webkit-resizer/);
  assert.doesNotMatch(wrapping, /font-family/);
});
