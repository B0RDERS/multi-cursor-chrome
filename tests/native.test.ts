import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deletionMotion,
  inferMotion,
} from '../src/editor/native-navigation.ts';
import type { Motion } from '../src/editor/native-navigation.ts';
import { NativeHistory } from '../src/editor/native-history.ts';
import type { EditorState } from '../src/editor/engine.ts';

const cursor = (anchor: number, head = anchor) => ({ anchor, head });
const state = (value: string, head: number): EditorState => ({
  value,
  selections: [cursor(head)],
});
test('native movement is inferred from the observed selection, regardless of shortcut key', () => {
  const before = cursor(12),
    after = cursor(0);
  const result = inferMotion(before, after, 'a', (motion) =>
    motion.granularity === 'lineboundary' && motion.direction === 'backward'
      ? after
      : before,
  );
  assert.deepEqual(result, {
    direction: 'backward',
    granularity: 'lineboundary',
    extend: false,
  });
});
test('learned browser motion wins when several operations match at a boundary', () => {
  const before = cursor(0);
  const learned: Motion = {
    direction: 'backward',
    granularity: 'word',
    extend: false,
  };
  assert.deepEqual(
    inferMotion(before, before, 'ArrowLeft', () => before, learned),
    learned,
  );
});
test('Shift preserves extension intent even when primary cursor is stuck at a boundary', () => {
  const before = cursor(0);
  const result = inferMotion(
    before,
    before,
    'ArrowLeft',
    () => before,
    undefined,
    true,
  );
  assert.equal(result?.extend, true);
});
test('unrecognized selection commands do not invent a matching motion', () => {
  assert.equal(
    inferMotion(cursor(2), cursor(4, 8), 'x', () => cursor(3)),
    undefined,
  );
});
test('deletion uses native input intents instead of modifier shortcuts', () => {
  assert.deepEqual(deletionMotion('deleteWordBackward'), {
    direction: 'backward',
    granularity: 'word',
    extend: true,
  });
  assert.deepEqual(deletionMotion('deleteSoftLineForward'), {
    direction: 'forward',
    granularity: 'lineboundary',
    extend: true,
  });
  assert.deepEqual(deletionMotion('deleteHardLineBackward'), {
    direction: 'backward',
    granularity: 'paragraphboundary',
    extend: true,
  });
});
test('native undo can skip several snapshots when typing is grouped', () => {
  const history = new NativeHistory();
  history.reset(state('', 0));
  history.record(state('a', 1));
  history.record(state('ab', 2));
  history.record(state('abc', 3));
  assert.deepEqual(history.restore('', false), state('', 0));
  assert.deepEqual(history.restore('abc', true), state('abc', 3));
});
test('native undo restores multiple cursors and a new edit discards the redo branch', () => {
  const history = new NativeHistory();
  const original = { value: 'a\na', selections: [cursor(0), cursor(2)] };
  history.reset(original);
  history.record({ value: '!a\n!a', selections: [cursor(1), cursor(4)] });
  assert.deepEqual(history.restore('a\na', false), original);
  history.record(state('new edit', 8));
  assert.equal(history.restore('!a\n!a', true), undefined);
});
test('cursor snapshots are independent of later selection mutations', () => {
  const history = new NativeHistory();
  const original = state('a', 0);
  history.reset(original);
  original.selections[0].head = 1;
  history.record(state('ab', 2));
  assert.equal(history.restore('a', false)?.selections[0].head, 0);
});
