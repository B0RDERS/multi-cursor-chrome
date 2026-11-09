/** Measure insertion positions, including lines containing only a newline. */
export function measureCaret(mirror: HTMLElement, position: number): DOMRect {
  const text = mirror.firstChild;
  if (!text || text.nodeType !== 3 /* TEXT_NODE */)
    throw new Error('Caret layout is unavailable');
  const range = mirror.ownerDocument.createRange();
  range.setStart(text, position);
  range.collapse(true);
  const character = text.textContent?.[position];
  // A soft wrap has two visual positions for one offset. Measuring the next
  // glyph gives that offset a consistent downstream position, independent of
  // the native selection's transient upstream/downstream affinity.
  if (character !== '\n') {
    range.setEnd(
      text,
      position +
        ((text.textContent?.codePointAt(position) ?? 0) > 0xffff ? 2 : 1),
    );
    const rect = range.getBoundingClientRect();
    if (rect.height > 0) return rect;
  }
  range.collapse(true);

  // A collapsed range on an empty line may have no box. A zero-width glyph
  // supplies one without changing wrapping or adding a visible character.
  const contents = text.textContent!;
  const marker = mirror.ownerDocument.createElement('span');
  marker.textContent = '\u200b';
  try {
    range.insertNode(marker);
    return marker.getBoundingClientRect();
  } finally {
    // Selection rendering expects one text node with original string offsets.
    mirror.replaceChildren(mirror.ownerDocument.createTextNode(contents));
  }
}

export function isSoftWrapBoundary(
  mirror: HTMLElement,
  position: number,
): boolean {
  const text = mirror.firstChild,
    contents = text?.textContent;
  if (
    !text ||
    !contents ||
    position <= 0 ||
    position >= contents.length - 1 ||
    contents[position - 1] === '\n' ||
    contents[position] === '\n'
  )
    return false;
  const range = mirror.ownerDocument.createRange();
  range.setStart(text, position - 1);
  range.setEnd(text, position);
  const before = range.getBoundingClientRect();
  range.setStart(text, position);
  range.setEnd(text, position + 1);
  const after = range.getBoundingClientRect();
  return (
    before.height > 0 &&
    after.height > 0 &&
    Math.abs(after.top - before.top) >=
      Math.min(before.height, after.height) / 2
  );
}
