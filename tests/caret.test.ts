import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureCaret } from '../src/editor/caret.ts';

// Model the browser's empty collapsed-range rectangle and the inline marker box.
// Actual text layout remains the browser's responsibility.
function fixture(contents: string, collapsedHeight: number) {
  let markerInserted = false;
  let restored: string | undefined;
  let position = -1;
  const originalText = { nodeType: 3, textContent: contents };
  const collapsedBox = { left: 0, top: 0, width: 0, height: collapsedHeight };
  const markerBox = { left: 24, top: 60, width: 0, height: 20 };
  const marker = { textContent: '', getBoundingClientRect: () => markerBox };
  const mirror = {
    firstChild: originalText,
    ownerDocument: {
      createRange: () => ({
        setStart: (node: unknown, offset: number) => {
          assert.equal(node, originalText);
          position = offset;
        },
        setEnd: () => {},
        collapse: (toStart: boolean) => assert.equal(toStart, true),
        getBoundingClientRect: () => collapsedBox,
        insertNode: (node: unknown) => {
          assert.equal(node, marker);
          assert.equal(marker.textContent, '\u200b');
          markerInserted = true;
        },
      }),
      createElement: (tag: string) => {
        assert.equal(tag, 'span');
        return marker;
      },
      createTextNode: (text: string) => ({ nodeType: 3, textContent: text }),
    },
    replaceChildren: (node: { textContent: string }) => {
      restored = node.textContent;
    },
  } as unknown as HTMLElement;
  return {
    mirror,
    collapsedBox,
    markerBox,
    observed: () => ({ markerInserted, restored, position }),
  };
}

test('empty line gets its inline marker rectangle and original text is restored', () => {
  const f = fixture('a\n\nb\u200b', 0);
  assert.equal(measureCaret(f.mirror, 2), f.markerBox);
  assert.deepEqual(f.observed(), {
    markerInserted: true,
    restored: 'a\n\nb\u200b',
    position: 2,
  });
});

test('newline position uses the inline marker even when the range reports a box', () => {
  const f = fixture('\n\u200b', 20);
  assert.equal(measureCaret(f.mirror, 0), f.markerBox);
  assert.equal(f.observed().restored, '\n\u200b');
});

test('empty textarea and trailing empty line get a measurable caret', () => {
  for (const contents of ['\u200b', 'a\n\u200b']) {
    const f = fixture(contents, 0);
    assert.equal(measureCaret(f.mirror, contents.length - 1), f.markerBox);
    assert.equal(f.observed().restored, contents);
  }
});

test('normal collapsed caret measurements leave the mirror untouched', () => {
  const f = fixture('abc\u200b', 20);
  assert.equal(measureCaret(f.mirror, 1), f.collapsedBox);
  assert.deepEqual(f.observed(), {
    markerInserted: false,
    restored: undefined,
    position: 1,
  });
});

test('soft-wrap caret always uses the following glyph rather than an ambiguous collapsed box', () => {
  const node = { nodeType: 3, textContent: 'abcd\u200b' };
  const previousLine = { left: 100, top: 0, bottom: 20, width: 0, height: 20 };
  const followingLine = { left: 0, top: 20, bottom: 40, width: 8, height: 20 };
  let start = 0,
    end = 0;
  const mirror = {
    firstChild: node,
    ownerDocument: {
      createRange: () => ({
        setStart: (_node: unknown, position: number) => {
          start = position;
        },
        setEnd: (_node: unknown, position: number) => {
          end = position;
        },
        collapse: () => {
          end = start;
        },
        getBoundingClientRect: () =>
          end > start ? followingLine : previousLine,
      }),
    },
  } as unknown as HTMLElement;
  assert.equal(measureCaret(mirror, 2), followingLine);
  assert.equal(measureCaret(mirror, 2), followingLine);
});
