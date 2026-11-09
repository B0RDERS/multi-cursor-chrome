import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/editor/engine.ts';

const s = (anchor: number, head = anchor) => ({ anchor, head });
test('vertical movement remembers column through short lines', () => {
  let p = E.moveVertical('abcdef\nx\nabcdef', s(5), 'down');
  assert.equal(p.head, 8);
  p = E.moveVertical('abcdef\nx\nabcdef', p, 'down');
  assert.equal(p.head, 14);
});
test('multiple insertions account for offsets', () =>
  assert.deepEqual(E.edit('abc\ndef', [s(1), s(5)], 'XY'), {
    value: 'aXYbc\ndXYef',
    selections: [s(3), s(9)],
  }));
test('overlapping and duplicate selections consolidate', () =>
  assert.deepEqual(E.merge([s(3, 1), s(2, 5), s(5)]), [s(5, 1)]));
test('vertical movement preserves the anchor when extending selections', () =>
  assert.deepEqual(E.moveVertical('abc\ndef', s(1), 'down', true), {
    anchor: 1,
    head: 5,
    column: 1,
  }));
test('deletion merges adjacent native edit ranges', () =>
  assert.equal(E.edit('abcd', [s(0, 1), s(1, 2)], '').value, 'cd'));
test('selection replacement and reverse selection', () =>
  assert.equal(E.edit('abcdef', [s(2, 0), s(6, 4)], '!').value, '!cd!'));
test('reversing downward cursor creation removes layers before adding above', () => {
  const expansion = new E.CursorExpansion();
  const text = 'aa\naa\naa\naa';
  let cursors: E.Selection[] = [s(4)];
  cursors = expansion.apply(text, cursors, 'down');
  assert.deepEqual(
    cursors.map((c) => c.head),
    [4, 7],
  );
  cursors = expansion.apply(text, cursors, 'down');
  assert.deepEqual(
    cursors.map((c) => c.head),
    [4, 7, 10],
  );
  cursors = expansion.apply(text, cursors, 'up');
  assert.deepEqual(
    cursors.map((c) => c.head),
    [4, 7],
  );
  cursors = expansion.apply(text, cursors, 'up');
  assert.deepEqual(
    cursors.map((c) => c.head),
    [4],
  );
  cursors = expansion.apply(text, cursors, 'up');
  assert.deepEqual(
    cursors.map((c) => c.head),
    [1, 4],
  );
});
test('reversing upward cursor creation removes the top cursor', () => {
  const expansion = new E.CursorExpansion();
  const text = 'aa\naa\naa';
  let cursors = expansion.apply(text, [s(7)], 'up');
  cursors = expansion.apply(text, cursors, 'up');
  assert.deepEqual(
    cursors.map((c) => c.head),
    [1, 4, 7],
  );
  cursors = expansion.apply(text, cursors, 'down');
  assert.deepEqual(
    cursors.map((c) => c.head),
    [4, 7],
  );
  cursors = expansion.apply(text, cursors, 'down');
  assert.deepEqual(
    cursors.map((c) => c.head),
    [7],
  );
});
test('cursor contraction retains edited positions rather than restoring old offsets', () => {
  const expansion = new E.CursorExpansion();
  const original = 'a\na\na';
  let cursors = expansion.apply(original, [s(0)], 'down');
  cursors = expansion.apply(original, cursors, 'down');
  const edited = E.edit(original, cursors, 'hello');
  cursors = expansion.apply(edited.value, edited.selections, 'up');
  assert.deepEqual(
    cursors.map((c) => c.head),
    [5, 12],
  );
  cursors = expansion.apply(edited.value, cursors, 'up');
  assert.deepEqual(
    cursors.map((c) => c.head),
    [5],
  );
});
test('adding at a document boundary is a no-op and does not add a removal layer', () => {
  const expansion = new E.CursorExpansion();
  let cursors: E.Selection[] = [s(1)];
  cursors = expansion.apply('aa\naa', cursors, 'down');
  cursors = expansion.apply('aa\naa', cursors, 'down');
  assert.deepEqual(
    cursors.map((c) => c.head),
    [1, 4],
  );
  cursors = expansion.apply('aa\naa', cursors, 'up');
  assert.deepEqual(
    cursors.map((c) => c.head),
    [1],
  );
  assert.deepEqual(expansion.apply('aa', [s(0)], 'down'), [s(0)]);
});
test('cursor expansion works across consecutive blank lines and a trailing newline', () => {
  const expansion = new E.CursorExpansion();
  const text = '\n\n\n';
  let cursors: E.Selection[] = [s(0)];
  for (let i = 0; i < 3; i++) cursors = expansion.apply(text, cursors, 'down');
  assert.deepEqual(
    cursors.map((c) => c.head),
    [0, 1, 2, 3],
  );
  cursors = expansion.apply(text, cursors, 'up');
  assert.deepEqual(
    cursors.map((c) => c.head),
    [0, 1, 2],
  );
});
test('a new expansion after reset does not remove cursors from the previous sequence', () => {
  const expansion = new E.CursorExpansion();
  const cursors = expansion.apply('a\na\na', [s(2)], 'down');
  expansion.reset();
  assert.deepEqual(
    expansion.apply('a\na\na', cursors, 'up').map((c) => c.head),
    [0, 2, 4],
  );
});

test('paste distributes lines in document order and replaces selections', () => {
  assert.deepEqual(E.paste('abc\ndef', [s(4, 7), s(0, 3)], 'X\nYZ'), {
    value: 'X\nYZ',
    selections: [s(1), s(4)],
  });
});
test('paste preserves empty lines and normalizes clipboard line endings', () => {
  assert.equal(
    E.paste('a\nb\nc', [s(0), s(2), s(4)], 'X\r\n\r\nZ').value,
    'Xa\nb\nZc',
  );
  assert.equal(E.paste('a\nb', [s(0), s(2)], 'X\n').value, 'Xa\nb');
});
test('unmatched pasted lines repeat at every cursor and single cursor keeps full text', () => {
  assert.equal(
    E.paste('a\nb', [s(0), s(2)], 'X\nY\nZ').value,
    'X\nY\nZa\nX\nY\nZb',
  );
  assert.equal(E.paste('ab', [s(1)], 'X\nY').value, 'aX\nYb');
});
