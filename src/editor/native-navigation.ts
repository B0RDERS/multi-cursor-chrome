import type { Selection as Cursor } from './engine.ts';
import { copyTextareaLayout } from './textarea-layout.ts';

export type Granularity =
  | 'character'
  | 'word'
  | 'line'
  | 'paragraph'
  | 'lineboundary'
  | 'paragraphboundary'
  | 'documentboundary';
export interface Motion {
  direction: 'backward' | 'forward' | 'left' | 'right';
  granularity: Granularity;
  extend: boolean;
}
export const sameSelection = (a: Cursor, b: Cursor): boolean =>
  a.anchor === b.anchor && a.head === b.head;

/** Infer an editing operation from what the browser actually did, not modifier bindings. */
export function inferMotion(
  before: Cursor,
  after: Cursor,
  key: string,
  probe: (motion: Motion) => Cursor,
  previous?: Motion,
  extendSelection = false,
): Motion | undefined {
  const extend =
    extendSelection ||
    (after.anchor === before.anchor && after.anchor !== after.head);
  const candidates: Motion[] = [];
  if (previous) candidates.push({ ...previous, extend });
  const vertical = key === 'ArrowUp' || key === 'ArrowDown';
  const boundary = key === 'Home' || key === 'End';
  const granularities: Granularity[] = vertical
    ? [
        'line',
        'paragraphboundary',
        'documentboundary',
        'paragraph',
        'character',
        'word',
        'lineboundary',
      ]
    : boundary
      ? [
          'lineboundary',
          'documentboundary',
          'paragraphboundary',
          'character',
          'word',
          'line',
          'paragraph',
        ]
      : [
          'character',
          'word',
          'lineboundary',
          'documentboundary',
          'paragraphboundary',
          'line',
          'paragraph',
        ];
  const backwards =
    key === 'ArrowLeft' ||
    key === 'ArrowUp' ||
    key === 'Home' ||
    after.head < before.head;
  const directions: Motion['direction'][] = backwards
    ? ['backward', 'left', 'forward', 'right']
    : ['forward', 'right', 'backward', 'left'];
  for (const granularity of granularities) {
    for (const direction of directions)
      candidates.push({ direction, granularity, extend });
  }
  return candidates.find((candidate) => sameSelection(probe(candidate), after));
}

/** Browser-native word and visual-line movement in an isolated selection surface. */
export class NativeNavigator {
  private frame: HTMLIFrameElement | null = null;
  private text: HTMLElement | null = null;
  private length = 0;

  prepare(textarea: HTMLTextAreaElement): void {
    if (!this.frame) {
      const frame = document.createElement('iframe');
      frame.tabIndex = -1;
      frame.setAttribute('aria-hidden', 'true');
      frame.setAttribute('sandbox', 'allow-same-origin');
      frame.style.cssText =
        'position:fixed;left:-100000px;top:0;opacity:0;pointer-events:none;border:0;';
      document.documentElement.append(frame);
      this.frame = frame;
    }
    const doc = this.frame.contentDocument;
    if (!doc) return;
    if (!this.text || this.text.ownerDocument !== doc) {
      this.text = doc.createElement('div');
      doc.body.replaceChildren(this.text);
      doc.body.style.margin = '0';
      doc.documentElement.style.overflow = 'hidden';
    }
    const style = getComputedStyle(textarea);
    this.frame.style.width = `${textarea.clientWidth}px`;
    this.frame.style.height = `${textarea.clientHeight}px`;
    copyTextareaLayout(textarea, this.text, style);
    this.text.style.width = '100%';
    this.text.textContent = textarea.value + '\u200b';
    // Selection.modify('line') uses the frame's viewport when finding the next
    // visual line. Keep every line inside that viewport so hidden cursors can
    // move past the textarea's visible edge without snapping to a line end.
    this.frame.style.height = `${Math.max(textarea.clientHeight, this.text.scrollHeight)}px`;
    this.length = textarea.value.length;
  }

  isOnLastLine(cursor: Cursor): boolean {
    return (
      this.move(cursor, {
        direction: 'forward',
        granularity: 'lineboundary',
        extend: true,
      }).head === this.length
    );
  }

  move(cursor: Cursor, motion: Motion): Cursor {
    const element = this.text,
      selection = this.frame?.contentWindow?.getSelection();
    const node = element?.firstChild;
    if (!element || !selection || !node) return cursor;
    selection.setBaseAndExtent(node, cursor.anchor, node, cursor.head);
    selection.modify(
      motion.extend ? 'extend' : 'move',
      motion.direction,
      motion.granularity,
    );
    const offset = (node: Node | null, position: number): number => {
      if (!node || !element.contains(node))
        return position === 0 ? 0 : this.length;
      const range = element.ownerDocument.createRange();
      range.selectNodeContents(element);
      range.setEnd(node, position);
      return Math.min(this.length, range.toString().length);
    };
    let result = {
      anchor: offset(selection.anchorNode, selection.anchorOffset),
      head: offset(selection.focusNode, selection.focusOffset),
    };
    // Blink can spend one character move changing only soft-wrap affinity.
    // Textarea cursors should advance an offset instead of adding a stop.
    if (motion.granularity === 'character' && sameSelection(result, cursor)) {
      selection.modify(
        motion.extend ? 'extend' : 'move',
        motion.direction,
        motion.granularity,
      );
      result = {
        anchor: offset(selection.anchorNode, selection.anchorOffset),
        head: offset(selection.focusNode, selection.focusOffset),
      };
    }
    return result;
  }
}

export function deletionMotion(inputType: string): Motion {
  const granularity: Granularity = inputType.includes('Word')
    ? 'word'
    : inputType.includes('SoftLine')
      ? 'lineboundary'
      : inputType.includes('HardLine')
        ? 'paragraphboundary'
        : 'character';
  return {
    direction: inputType.includes('Backward') ? 'backward' : 'forward',
    granularity,
    extend: true,
  };
}
