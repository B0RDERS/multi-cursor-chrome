/** Keep caret rendering and native navigation on the same textarea layout. */
export function copyTextareaLayout(
  textarea: HTMLTextAreaElement,
  target: HTMLElement,
  style: CSSStyleDeclaration,
): void {
  for (const prop of [
    'fontFamily',
    'fontSize',
    'fontWeight',
    'fontStyle',
    'lineHeight',
    'letterSpacing',
    'wordSpacing',
    'textIndent',
    'textAlign',
    'tabSize',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'direction',
    'textTransform',
  ] as const)
    target.style[prop] = style[prop];
  target.style.whiteSpace =
    style.whiteSpace || (textarea.wrap === 'off' ? 'pre' : 'pre-wrap');
  target.style.overflowWrap = style.overflowWrap || 'break-word';
  target.style.wordBreak = style.wordBreak;
  target.style.boxSizing = 'border-box';
}
