import * as E from './engine.ts';
import type { EditorState, Selection } from './engine.ts';
import * as S from '../settings.ts';
import { measureCaret, isSoftWrapBoundary } from './caret.ts';
import {
  NativeNavigator,
  deletionMotion,
  inferMotion,
  sameSelection,
} from './native-navigation.ts';
import type { Motion } from './native-navigation.ts';
import { NativeHistory } from './native-history.ts';
import { textareaPreferenceCSS } from './textarea-preferences.ts';
import { copyTextareaLayout } from './textarea-layout.ts';
(() => {
  'use strict';
  const runtime = globalThis as typeof globalThis & {
    __textareaMultiCursorLoaded?: boolean;
  };
  if (runtime.__textareaMultiCursorLoaded) return;
  runtime.__textareaMultiCursorLoaded = true;
  const platform = S.detectPlatform();
  let settings = S.normalize({}, platform);
  const preferenceStyle = document.createElement('style');
  document.documentElement.append(preferenceStyle);
  const selectionAttribute = 'data-multi-cursor-selection';
  const selectionStyle = document.createElement('style');
  selectionStyle.textContent = `textarea[${selectionAttribute}]::selection { background-color: transparent !important; color: inherit !important; }`;
  document.documentElement.append(selectionStyle);
  function updateSettings(raw: unknown) {
    settings = S.normalize(raw, platform);
    preferenceStyle.textContent = textareaPreferenceCSS(settings);
    learnedMotions.clear();
    render();
  }
  if (globalThis.chrome?.storage) {
    chrome.storage.local
      .get('settings')
      .then((result) => {
        updateSettings(result.settings);
      })
      .catch(() => {});
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.settings)
        updateSettings(changes.settings.newValue);
    });
  }
  let active: HTMLTextAreaElement | null = null;
  let selections: Selection[] = [];
  const history = new NativeHistory();
  const navigator = new NativeNavigator();
  const learnedMotions = new Map<string, Motion>();
  let pendingMovement: { event: KeyboardEvent; before: Selection } | null =
    null;
  let writing = false;
  const expansion = new E.CursorExpansion();
  let composing = false,
    compositionBase: EditorState | null = null;
  const host = document.createElement('div');
  host.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent =
    '@keyframes caret-blink { 0%,49.999% { opacity:1 } 50%,100% { opacity:0 } }';
  shadow.append(style);
  let blinkEpoch = performance.now();
  let hiddenCaret: {
    element: HTMLTextAreaElement;
    value: string;
    priority: string;
    color: string;
  } | null = null;
  function restoreCaret() {
    if (!hiddenCaret) return;
    const { element, value, priority } = hiddenCaret;
    element.removeAttribute(selectionAttribute);
    if (value) element.style.setProperty('caret-color', value, priority);
    else element.style.removeProperty('caret-color');
    hiddenCaret = null;
  }
  const clip = document.createElement('div'),
    mirror = document.createElement('div'),
    marks = document.createElement('div');
  clip.style.cssText = 'position:absolute;overflow:hidden;pointer-events:none;';
  mirror.style.cssText =
    'position:absolute;visibility:hidden;pointer-events:none;';
  marks.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
  clip.append(mirror, marks);
  shadow.append(clip);
  document.documentElement.append(host);
  function nativeSelection(): Selection {
    if (!active) throw new Error('No active textarea');
    return {
      anchor:
        active.selectionDirection === 'backward'
          ? active.selectionEnd
          : active.selectionStart,
      head:
        active.selectionDirection === 'backward'
          ? active.selectionStart
          : active.selectionEnd,
    };
  }
  function sync() {
    if (!active || !selections.length) return;
    const s = selections[0],
      [a, b] = E.range(s);
    // Rewriting an unchanged native selection discards its wrap-boundary
    // affinity and makes it jump between the two visual positions.
    if (!sameSelection(nativeSelection(), s))
      active.setSelectionRange(
        a,
        b,
        s.head < s.anchor ? 'backward' : 'forward',
      );
    blinkEpoch = performance.now();
    render();
  }
  function layout() {
    if (!active) throw new Error('No active textarea');
    const cs = getComputedStyle(active),
      r = active.getBoundingClientRect();
    clip.style.left = `${r.left + active.clientLeft}px`;
    clip.style.top = `${r.top + active.clientTop}px`;
    clip.style.width = `${active.clientWidth}px`;
    clip.style.height = `${active.clientHeight}px`;
    copyTextareaLayout(active, mirror, cs);
    mirror.style.fontVariant = cs.fontVariant;
    mirror.style.width = `${active.clientWidth}px`;
    mirror.style.left = `${-active.scrollLeft}px`;
    mirror.style.top = `${-active.scrollTop}px`;
    mirror.replaceChildren(document.createTextNode(active.value + '\u200b'));
    return cs;
  }
  function render() {
    marks.replaceChildren();
    if (
      !active ||
      selections.length < 2 ||
      document.activeElement !== active ||
      !document.hasFocus()
    ) {
      restoreCaret();
      return;
    }
    const cs = layout(),
      base = clip.getBoundingClientRect();
    if (!hiddenCaret) {
      const color = cs.caretColor === 'auto' ? cs.color : cs.caretColor;
      hiddenCaret = {
        element: active,
        value: active.style.getPropertyValue('caret-color'),
        priority: active.style.getPropertyPriority('caret-color'),
        color,
      };
      active.style.setProperty('caret-color', 'transparent', 'important');
      active.setAttribute(selectionAttribute, '');
    }
    const add = (r: DOMRect, color: string, width?: number) => {
      const d = document.createElement('div');
      d.style.cssText = `position:absolute;left:${r.left - base.left}px;top:${r.top - base.top}px;width:${width ?? r.width}px;height:${r.height || parseFloat(cs.fontSize) * 1.2}px;background:${color};`;
      marks.append(d);
      return d;
    };
    selections.forEach((s) => {
      const [a, b] = E.range(s);
      if (a !== b) {
        const r = document.createRange();
        r.setStart(mirror.firstChild!, a);
        r.setEnd(mirror.firstChild!, b);
        for (const rect of r.getClientRects())
          add(rect, 'rgba(40,125,245,.32)');
      }
      // Render the primary caret too: the browser's native blink phase is not exposed.
      const cursor = add(measureCaret(mirror, s.head), hiddenCaret!.color, 1);
      cursor.style.animation = 'caret-blink 1s step-end infinite';
      cursor.style.animationDelay = `-${(performance.now() - blinkEpoch) % 1000}ms`;
    });
  }
  function snapshot(): EditorState {
    if (!active) throw new Error('No active textarea');
    return {
      value: active.value,
      selections: selections.map((s) => ({ ...s })),
    };
  }

  function write(
    state: EditorState,
    inputType = 'insertText',
    data: string | null = null,
    before?: EditorState,
  ) {
    if (!active) return;
    // Composition supplies its snapshot from before the browser changed the text.
    history.record(before ?? snapshot());
    pendingMovement = null;
    let nativeInput = false;
    writing = true;
    try {
      if (active.value !== state.value) {
        // Chrome's editing command records a native undo transaction. Directly
        // assigning .value would bypass the browser's configured undo shortcuts.
        active.setSelectionRange(0, active.value.length);
        nativeInput = document.execCommand('insertText', false, state.value);
        if (!nativeInput) {
          Object.getOwnPropertyDescriptor(
            HTMLTextAreaElement.prototype,
            'value',
          )!.set!.call(active, state.value);
        }
      }
      selections =
        active.value === state.value ? state.selections : [nativeSelection()];
      sync();
      history.record(snapshot());
      if (!nativeInput)
        active.dispatchEvent(
          new InputEvent('input', {
            bubbles: true,
            composed: true,
            inputType,
            data,
          }),
        );
    } finally {
      writing = false;
    }
  }

  function change(insert: string, inputType: string) {
    if (active)
      write(E.edit(active.value, selections, insert), inputType, insert);
  }

  function flushNativeMovement() {
    const pending = pendingMovement;
    pendingMovement = null;
    if (
      !pending ||
      !active ||
      document.activeElement !== active ||
      pending.event.defaultPrevented
    )
      return;
    const after = nativeSelection();
    const { event, before } = pending;
    if (selections.length < 2) {
      selections = [after];
      return;
    }
    const signature = [
      event.code || event.key,
      event.metaKey,
      event.ctrlKey,
      event.altKey,
    ].join(':');
    const previous = learnedMotions.get(signature);
    const unchanged = sameSelection(before, after);
    if (
      unchanged &&
      !previous &&
      ![
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Home',
        'End',
      ].includes(event.key)
    )
      return;
    if (
      !event.shiftKey &&
      after.anchor !== after.head &&
      E.range(after)[0] === 0 &&
      E.range(after)[1] === active.value.length
    ) {
      expansion.reset();
      selections = [after];
      sync();
      return;
    }
    navigator.prepare(active);
    if (
      unchanged &&
      (event.key === 'ArrowLeft' || event.key === 'ArrowRight') &&
      (previous?.granularity === 'character' ||
        (!previous && !event.metaKey && !event.ctrlKey && !event.altKey))
    ) {
      layout();
      if (isSoftWrapBoundary(mirror, before.head)) {
        const motion: Motion = {
          direction: event.key === 'ArrowLeft' ? 'backward' : 'forward',
          granularity: 'character',
          extend: event.shiftKey,
        };
        selections = E.merge(
          selections.map((cursor) => navigator.move(cursor, motion)),
        );
        expansion.reset();
        sync();
        return;
      }
    }
    const motion = inferMotion(
      before,
      after,
      event.key,
      (candidate) => navigator.move(before, candidate),
      previous,
      event.shiftKey,
    );
    if (!motion) {
      if (!unchanged) {
        expansion.reset();
        selections = [after];
        sync();
      }
      return;
    }
    if (!unchanged) learnedMotions.set(signature, motion);
    expansion.reset();
    selections = E.merge([
      after,
      ...selections
        .slice(1)
        .filter(
          (cursor) =>
            !(
              event.key === 'ArrowDown' &&
              motion.granularity === 'line' &&
              motion.direction === 'forward' &&
              navigator.isOnLastLine(cursor)
            ),
        )
        .map((cursor) => navigator.move(cursor, motion)),
    ]);
    sync();
  }

  function activate(element: HTMLTextAreaElement) {
    if (active === element) return;
    restoreCaret();
    pendingMovement = null;
    expansion.reset();
    active = element;
    selections = [nativeSelection()];
    history.reset(snapshot());
  }

  document.addEventListener(
    'focusin',
    (event) => {
      if (event.target instanceof HTMLTextAreaElement) {
        activate(event.target);
        render();
      } else {
        restoreCaret();
        pendingMovement = null;
        expansion.reset();
        active = null;
        marks.replaceChildren();
      }
    },
    true,
  );

  let pointer: { element: HTMLTextAreaElement; x: number; y: number } | null =
    null;
  function toggleAt(point: { x: number; y: number }) {
    if (!active) return;
    flushNativeMovement();
    expansion.reset();
    if (!selections.length) selections = [nativeSelection()];
    layout();
    const length = active.value.length;
    let best = 0,
      distance = Infinity;
    for (let p = 0; p <= length; p++) {
      const rect = measureCaret(mirror, p);
      const dy =
        point.y < rect.top
          ? rect.top - point.y
          : point.y > rect.bottom
            ? point.y - rect.bottom
            : 0;
      const d = dy * dy * 100 + (rect.left - point.x) ** 2;
      if (d < distance) {
        distance = d;
        best = p;
      }
    }
    const index = selections.findIndex(
      (cursor) => cursor.anchor === best && cursor.head === best,
    );
    if (index >= 0 && selections.length > 1) selections.splice(index, 1);
    else if (index < 0) selections.push({ anchor: best, head: best });
    selections = E.merge(selections);
    sync();
  }
  document.addEventListener(
    'pointermove',
    (event) => {
      pointer =
        event.target instanceof HTMLTextAreaElement
          ? { element: event.target, x: event.clientX, y: event.clientY }
          : null;
    },
    true,
  );
  for (const type of ['contextmenu', 'auxclick'] as const) {
    document.addEventListener(
      type,
      (event) => {
        if (
          event.target instanceof HTMLTextAreaElement &&
          !event.target.disabled &&
          !event.target.readOnly &&
          S.matches(
            S.bindingFromEvent(event, `Mouse${event.button}`),
            settings.toggleBinding,
          )
        ) {
          event.preventDefault();
        }
      },
      true,
    );
  }
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (
        !(event.target instanceof HTMLTextAreaElement) ||
        event.target.disabled ||
        event.target.readOnly
      )
        return;
      activate(event.target);
      flushNativeMovement();
      expansion.reset();
      pointer = { element: event.target, x: event.clientX, y: event.clientY };
      if (
        S.matches(
          S.bindingFromEvent(event, `Mouse${event.button}`),
          settings.toggleBinding,
        )
      ) {
        event.preventDefault();
        event.target.focus();
        toggleAt(pointer);
      } else {
        selections = [];
        restoreCaret();
        marks.replaceChildren();
      }
    },
    true,
  );

  document.addEventListener('selectionchange', () => {
    if (!active || writing || composing || document.activeElement !== active)
      return;
    if (pendingMovement) flushNativeMovement();
    else {
      const selected = nativeSelection();
      if (selections.length <= 1 || !sameSelection(selected, selections[0])) {
        // Mouse selection, Select All from a menu, or a browser command
        // with no preceding key event becomes the browser's selection.
        selections = [selected];
        render();
      }
    }
  });

  document.addEventListener(
    'keydown',
    (event) => {
      if (
        !active ||
        event.target !== active ||
        active.readOnly ||
        active.disabled ||
        composing ||
        event.isComposing ||
        event.getModifierState?.('AltGraph') ||
        event.cancelable === false
      )
        return;
      flushNativeMovement();
      if (!selections.length) selections = [nativeSelection()];
      if (
        S.matches(S.bindingFromEvent(event, event.key), settings.toggleBinding)
      ) {
        if (pointer?.element === active) {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (!event.repeat) toggleAt(pointer);
        }
        return;
      }
      const action = S.resolve(event, settings);
      if (action) {
        event.preventDefault();
        event.stopImmediatePropagation();
        selections = expansion.apply(
          active.value,
          selections,
          action === 'addBelow' ? 'down' : 'up',
          event.shiftKey,
        );
        sync();
        return;
      }
      if (selections.length < 2) return;
      if (event.key === 'Escape') {
        expansion.reset();
        selections = [nativeSelection()];
        sync();
        return;
      }
      // Let the trusted key event execute normally. Observe its result after
      // the default action, then use browser-native selection operations for
      // additional cursors. No platform modifier-to-command table is needed.
      if (!['Meta', 'Alt', 'Control', 'Shift', 'Tab'].includes(event.key)) {
        pendingMovement = { event, before: { ...selections[0] } };
        setTimeout(flushNativeMovement, 0);
      }
    },
    true,
  );

  document.addEventListener(
    'beforeinput',
    (event) => {
      if (!active || event.target !== active || writing || composing) return;
      pendingMovement = null;
      // Native undo/redo runs against the browser's undo stack. The input
      // listener restores associated cursor snapshots after the text changes.
      if (
        event.inputType === 'historyUndo' ||
        event.inputType === 'historyRedo'
      ) {
        expansion.reset();
        return;
      }
      if (selections.length < 2 || !event.cancelable || active.readOnly) return;
      if (
        event.inputType === 'insertText' ||
        event.inputType === 'insertReplacementText'
      ) {
        event.preventDefault();
        change(event.data || '', event.inputType);
      } else if (
        event.inputType === 'insertLineBreak' ||
        event.inputType === 'insertParagraph'
      ) {
        event.preventDefault();
        change('\n', event.inputType);
      } else if (event.inputType.startsWith('delete')) {
        event.preventDefault();
        navigator.prepare(active);
        const motion = deletionMotion(event.inputType);
        const targets = selections.map((cursor) =>
          cursor.anchor === cursor.head
            ? navigator.move(cursor, motion)
            : cursor,
        );
        write(E.edit(active.value, targets, ''), event.inputType);
      }
    },
    true,
  );

  document.addEventListener(
    'paste',
    (event) => {
      if (!active || event.target !== active) return;
      pendingMovement = null;
      if (selections.length > 1 && !active.readOnly && event.clipboardData) {
        event.preventDefault();
        const text = event.clipboardData.getData('text/plain');
        write(E.paste(active.value, selections, text), 'insertFromPaste', text);
      }
    },
    true,
  );
  for (const type of ['copy', 'cut'] as const)
    document.addEventListener(
      type,
      (event) => {
        if (!active || event.target !== active) return;
        pendingMovement = null;
        if (selections.length < 2 || !event.clipboardData) return;
        event.preventDefault();
        event.clipboardData.setData(
          'text/plain',
          selections
            .map((cursor) => active!.value.slice(...E.range(cursor)))
            .join('\n'),
        );
        if (type === 'cut' && !active.readOnly) change('', 'deleteByCut');
      },
      true,
    );

  document.addEventListener(
    'compositionstart',
    (event) => {
      if (!active || event.target !== active) return;
      pendingMovement = null;
      composing = true;
      compositionBase = selections.length > 1 ? snapshot() : null;
    },
    true,
  );
  document.addEventListener(
    'compositionend',
    (event) => {
      if (!active || event.target !== active) return;
      composing = false;
      if (!compositionBase) return;
      const base = compositionBase,
        target = active;
      compositionBase = null;
      queueMicrotask(() => {
        if (active !== target) return;
        write(
          event.data ? E.edit(base.value, base.selections, event.data) : base,
          'insertText',
          event.data,
          base,
        );
      });
    },
    true,
  );

  document.addEventListener(
    'input',
    (event) => {
      if (!active || event.target !== active || writing || composing) return;
      pendingMovement = null;
      const inputType = event instanceof InputEvent ? event.inputType : '';
      if (inputType === 'historyUndo' || inputType === 'historyRedo') {
        expansion.reset();
        const state = history.restore(
          active.value,
          inputType === 'historyRedo',
        );
        selections = state?.selections || [nativeSelection()];
        if (!state) history.reset(snapshot());
      } else {
        selections = [nativeSelection()];
        history.record(snapshot());
      }
      sync();
    },
    true,
  );
  document.addEventListener('scroll', render, true);
  window.addEventListener('resize', render);
  window.addEventListener('blur', render);
  window.addEventListener('focus', () => {
    blinkEpoch = performance.now();
    render();
  });
  // At document_idle, autofocus or page scripts may already have focused a field.
  if (document.activeElement instanceof HTMLTextAreaElement) {
    activate(document.activeElement);
    render();
  }
})();
