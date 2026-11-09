export interface Selection {
  anchor: number;
  head: number;
  column?: number;
}
export interface EditorState {
  value: string;
  selections: Selection[];
}
export const range = (s: Selection): [number, number] => [
  Math.min(s.anchor, s.head),
  Math.max(s.anchor, s.head),
];
export function merge(selections: Selection[]): Selection[] {
  const sorted = selections
    .map((s) => ({ ...s }))
    .sort((a, b) => range(a)[0] - range(b)[0] || range(a)[1] - range(b)[1]);
  const out: Selection[] = [];
  for (const s of sorted) {
    const p = out.at(-1),
      [a, b] = range(s);
    if (p && a <= range(p)[1]) {
      const lo = range(p)[0],
        hi = Math.max(range(p)[1], b);
      const backwards = p.head < p.anchor;
      p.anchor = backwards ? hi : lo;
      p.head = backwards ? lo : hi;
      delete p.column;
    } else out.push(s);
  }
  return out;
}
const lineStart = (t: string, p: number) =>
  p === 0 ? 0 : t.lastIndexOf('\n', p - 1) + 1;
const lineEnd = (t: string, p: number) => {
  const i = t.indexOf('\n', p);
  return i < 0 ? t.length : i;
};
/** Logical-line movement is only used when adding cursors. */
export function moveVertical(
  text: string,
  selection: Selection,
  direction: 'up' | 'down',
  shift = false,
): Selection {
  const start = lineStart(text, selection.head);
  const end = lineEnd(text, selection.head);
  const column = selection.column ?? selection.head - start;
  const head =
    direction === 'up'
      ? start === 0
        ? 0
        : Math.min(lineStart(text, start - 1) + column, start - 1)
      : end === text.length
        ? text.length
        : Math.min(end + 1 + column, lineEnd(text, end + 1));
  return { anchor: shift ? selection.anchor : head, head, column };
}
export function edit(
  t: string,
  selections: Selection[],
  insert: string | string[],
): EditorState {
  const operations = merge(selections);
  let value = '',
    cursor = 0;
  const result: Selection[] = [];
  for (const [index, s] of operations.entries()) {
    const [a, b] = range(s);
    value +=
      t.slice(cursor, a) +
      (typeof insert === 'string' ? insert : insert[index]);
    result.push({ anchor: value.length, head: value.length });
    cursor = b;
  }
  return { value: value + t.slice(cursor), selections: merge(result) };
}

/** Distribute matching clipboard lines in document order; otherwise repeat the text. */
export function paste(
  t: string,
  selections: Selection[],
  text: string,
): EditorState {
  const cursors = merge(selections);
  const normalized = text.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  return edit(
    t,
    cursors,
    cursors.length > 1 && lines.length === cursors.length ? lines : normalized,
  );
}

/** Tracks the layers added by vertical cursor shortcuts, including after typing. */
export class CursorExpansion {
  private layers: {
    direction: 'up' | 'down';
    keep: number[];
    count: number;
  }[] = [];

  reset(): void {
    this.layers = [];
  }

  apply(
    text: string,
    selections: Selection[],
    direction: 'up' | 'down',
    shift = false,
  ): Selection[] {
    const last = this.layers.at(-1);
    // Merging cursors changes their identities; start a fresh expansion then.
    if (last && last.count !== selections.length) this.reset();
    const layer = this.layers.at(-1);
    if (layer && layer.direction !== direction) {
      this.layers.pop();
      return layer.keep.map((index) => selections[index]);
    }

    const added = selections
      .filter((s) =>
        direction === 'up'
          ? lineStart(text, s.head) > 0
          : lineEnd(text, s.head) < text.length,
      )
      .map((s) => moveVertical(text, s, direction, shift));
    if (!added.length) return selections;
    const expanded = merge([...selections, ...added]);
    if (expanded.length > selections.length) {
      // Retain the original cursors by index so typing can move them without
      // invalidating the removal order. Editing preserves document order.
      const keep = [
        ...new Set(
          selections.map((s) => {
            const [a, b] = range(s);
            return expanded.findIndex((candidate) => {
              const [start, end] = range(candidate);
              return start <= a && end >= b;
            });
          }),
        ),
      ];
      this.layers.push({ direction, keep, count: expanded.length });
    }
    return expanded;
  }
}
