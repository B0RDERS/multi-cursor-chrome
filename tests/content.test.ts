import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

/** Small event harness: native browser actions are supplied explicitly by each test. */
function editor(
  initial: string,
  platform = 'MacIntel',
  nativeWrites = true,
  fireFocus = true,
) {
  type Handler = (event: TestEvent) => void;
  class TestEvent {
    defaultPrevented = false;
    key = '';
    code = '';
    button = 0;
    clientX = 0;
    clientY = 0;
    repeat = false;
    isComposing = false;
    getModifierState = (_key: string) => false;
    metaKey = false;
    ctrlKey = false;
    altKey = false;
    shiftKey = false;
    inputType = '';
    data: string | null = null;
    clipboardData: {
      getData(type: string): string;
      setData?(type: string, value: string): void;
    } | null = null;
    target: unknown = null;
    cancelable = true;
    type: string;
    constructor(type: string, fields: Partial<TestEvent> = {}) {
      this.type = type;
      Object.assign(this, fields);
    }
    preventDefault() {
      this.defaultPrevented = true;
    }
    stopImmediatePropagation() {}
  }
  const handlers = new Map<string, Handler[]>();
  const rect = {
    left: 0,
    top: 0,
    bottom: 20,
    right: 300,
    width: 300,
    height: 20,
  };
  class Style {
    cssText = '';
    private properties = new Map<string, string>();
    setProperty(key: string, value: string) {
      this.properties.set(key, value);
    }
    getPropertyValue(key: string) {
      return this.properties.get(key) || '';
    }
    getPropertyPriority() {
      return '';
    }
    removeProperty(key: string) {
      this.properties.delete(key);
    }
  }
  class Element {
    testShadow: Element | null = null;
    attributes = new Map<string, string>();
    setAttribute(name: string, value: string) {
      this.attributes.set(name, value);
    }
    removeAttribute(name: string) {
      this.attributes.delete(name);
    }
    style = new Style();
    children: unknown[] = [];
    firstChild: unknown = null;
    textContent = '';
    get ownerDocument() {
      return doc;
    }
    append(...nodes: unknown[]) {
      this.children.push(...nodes);
    }
    replaceChildren(...nodes: unknown[]) {
      this.children = nodes;
      this.firstChild = nodes[0] || null;
    }
    attachShadow() {
      this.testShadow = new Element();
      return this.testShadow;
    }
    getBoundingClientRect() {
      return rect;
    }
  }
  class Textarea extends Element {
    private contents = initial;
    selectionWrites = 0;
    get value() {
      return this.contents;
    }
    set value(value: string) {
      this.contents = value;
    }
    selectionStart = 0;
    selectionEnd = 0;
    selectionDirection = 'forward';
    readOnly = false;
    disabled = false;
    clientLeft = 0;
    clientTop = 0;
    clientWidth = 300;
    clientHeight = 200;
    scrollLeft = 0;
    scrollTop = 0;
    wrap = 'soft';
    setSelectionRange(start: number, end: number, direction = 'forward') {
      this.selectionWrites++;
      this.selectionStart = start;
      this.selectionEnd = end;
      this.selectionDirection = direction;
    }
    focus() {}
    dispatchEvent(event: TestEvent) {
      fire(event.type, event);
      return true;
    }
  }
  const textarea = new Textarea();
  const transactions: string[] = [];
  const doc = {
    activeElement: textarea,
    documentElement: new Element(),
    hasFocus: () => true,
    createElement: () => new Element(),
    createTextNode: (textContent: string) => ({ nodeType: 3, textContent }),
    createRange: () => ({
      setStart() {},
      setEnd() {},
      collapse() {},
      getBoundingClientRect: () => rect,
      getClientRects: () => [rect],
    }),
    addEventListener: (type: string, handler: Handler) =>
      handlers.set(type, [...(handlers.get(type) || []), handler]),
    execCommand: (command: string, _ui: boolean, value: string) => {
      assert.equal(command, 'insertText');
      if (!nativeWrites) return false;
      transactions.push(textarea.value);
      textarea.value = value;
      textarea.setSelectionRange(value.length, value.length);
      fire(
        'input',
        new TestEvent('input', { inputType: 'insertText', data: value }),
      );
      return true;
    },
  };
  function fire(type: string, event = new TestEvent(type)): TestEvent {
    event.target = textarea;
    for (const handler of handlers.get(type) || []) handler(event);
    return event;
  }
  let storageChanged: (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => void = () => {};
  new Script(
    readFileSync(new URL('../dist/content.js', import.meta.url), 'utf8'),
  ).runInNewContext({
    chrome: {
      storage: {
        local: { get: async () => ({}) },
        onChanged: {
          addListener(handler: typeof storageChanged) {
            storageChanged = handler;
          },
        },
      },
    },
    document: doc,
    navigator: { platform },
    window: { addEventListener() {} },
    HTMLTextAreaElement: Textarea,
    InputEvent: TestEvent,
    performance: { now: () => 0 },
    getComputedStyle: () => ({
      fontSize: '16px',
      caretColor: '#111',
      color: '#111',
    }),
    setTimeout() {},
    queueMicrotask,
  });
  if (fireFocus) fire('focusin');
  const key = (key: string, fields: Partial<TestEvent> = {}) =>
    fire('keydown', new TestEvent('keydown', { key, ...fields }));
  const type = (text: string) =>
    fire(
      'beforeinput',
      new TestEvent('beforeinput', { inputType: 'insertText', data: text }),
    );
  const configure = (settings: unknown) =>
    storageChanged({ settings: { newValue: settings } }, 'local');
  return { textarea, key, type, fire, TestEvent, transactions, configure, doc };
}

test('primary and secondary selections use matching overlays and restore native highlighting', () => {
  const e = editor('ab\ncd');
  e.textarea.setSelectionRange(0, 1);
  e.fire('selectionchange');
  e.key('ArrowDown', { altKey: true, metaKey: true });
  const host = e.doc.documentElement.children.at(-1) as {
    testShadow: {
      children: {
        children: { children: { style: { cssText: string } }[] }[];
      }[];
    };
  };
  const marks = host.testShadow.children[1].children[1];
  assert.equal(
    marks.children.filter((mark) =>
      mark.style.cssText.includes('rgba(40,125,245,.32)'),
    ).length,
    1,
  );
  assert.equal(e.textarea.attributes.has('data-multi-cursor-selection'), true);
  e.key('Escape');
  assert.equal(e.textarea.attributes.has('data-multi-cursor-selection'), false);
});

test('already focused textarea accepts shortcuts without a new focus event', () => {
  const e = editor('a\na', 'MacIntel', true, false);
  assert.equal(
    e.key('ArrowDown', { altKey: true, metaKey: true }).defaultPrevented,
    true,
  );
  e.type('!');
  assert.equal(e.textarea.value, '!a\n!a');
});

test('movement and editing key events are left to native browser defaults', () => {
  for (const [key, modifiers] of [
    ['ArrowLeft', {}],
    ['ArrowRight', { altKey: true }],
    ['Home', {}],
    ['End', {}],
    ['a', { metaKey: true }],
    ['z', { metaKey: true }],
    ['z', { metaKey: true, shiftKey: true }],
    ['Backspace', { altKey: true }],
  ] as const) {
    const e = editor('a\na');
    assert.equal(
      e.key('ArrowDown', { altKey: true, metaKey: true }).defaultPrevented,
      true,
    );
    assert.equal(e.key(key, modifiers).defaultPrevented, false, key);
  }
});

test('browser Select All collapses to its native selection rather than retaining extra cursors', () => {
  const e = editor('a\na');
  e.key('ArrowDown', { altKey: true, metaKey: true });
  e.key('a', { metaKey: true });
  e.textarea.setSelectionRange(0, e.textarea.value.length);
  e.fire('selectionchange');
  // One native selection remains, so its next input is not intercepted.
  assert.equal(e.type('replacement').defaultPrevented, false);
});

test('multi-cursor input creates a native undo transaction and restores cursors after native undo', () => {
  const e = editor('a\na');
  e.key('ArrowDown', { altKey: true, metaKey: true });
  assert.equal(e.type('!').defaultPrevented, true);
  assert.equal(e.textarea.value, '!a\n!a');
  assert.deepEqual(e.transactions, ['a\na']);
  const undo = e.fire(
    'beforeinput',
    new e.TestEvent('beforeinput', { inputType: 'historyUndo' }),
  );
  assert.equal(undo.defaultPrevented, false);
  e.textarea.value = e.transactions.pop()!;
  e.textarea.setSelectionRange(0, e.textarea.value.length);
  e.fire('input', new e.TestEvent('input', { inputType: 'historyUndo' }));
  e.type('?');
  assert.equal(e.textarea.value, '?a\n?a');
});

test('adding and removing extra cursors preserves the native primary caret affinity', () => {
  const e = editor('a\na');
  e.key('ArrowDown', { altKey: true, metaKey: true });
  assert.equal(e.textarea.selectionWrites, 0);
  e.key('ArrowUp', { altKey: true, metaKey: true });
  assert.equal(e.textarea.selectionWrites, 0);
});

for (const platform of ['Win32', 'Linux x86_64']) {
  test(`${platform} adds and removes cursors with Alt arrows`, () => {
    const e = editor('a\na', platform);
    assert.equal(e.key('ArrowDown', { altKey: true }).defaultPrevented, true);
    assert.equal(e.type('!').defaultPrevented, true);
    assert.equal(e.textarea.value, '!a\n!a');
    e.key('ArrowUp', { altKey: true });
    assert.equal(e.type('?').defaultPrevented, false);
  });
}

test('composition and AltGr events do not trigger matching cursor shortcuts', () => {
  const e = editor('a\na', 'Win32');
  for (const fields of [
    { isComposing: true },
    { getModifierState: (key: string) => key === 'AltGraph' },
    { cancelable: false },
  ]) {
    assert.equal(
      e.key('ArrowDown', { altKey: true, ...fields }).defaultPrevented,
      false,
    );
    assert.equal(e.type('!').defaultPrevented, false);
  }
});

test('matching pasted lines go to separate cursors and remain one undo transaction', () => {
  const e = editor('a\na');
  e.key('ArrowDown', { altKey: true, metaKey: true });
  const paste = e.fire(
    'paste',
    new e.TestEvent('paste', {
      clipboardData: { getData: () => 'one\r\ntwo' },
    }),
  );
  assert.equal(paste.defaultPrevented, true);
  assert.equal(e.textarea.value, 'onea\ntwoa');
  assert.deepEqual(e.transactions, ['a\na']);
  e.type('!');
  assert.equal(e.textarea.value, 'one!a\ntwo!a');
});

test('keyboard toggle uses the pointer location and ignores key repeats', () => {
  const e = editor('abc');
  e.configure({ toggleBinding: { key: 't', ctrl: true, shift: true } });
  e.textarea.setSelectionRange(3, 3);
  e.fire('selectionchange');
  assert.equal(
    e.key('t', { ctrlKey: true, shiftKey: true }).defaultPrevented,
    false,
  );
  e.fire(
    'pointermove',
    new e.TestEvent('pointermove', { clientX: 0, clientY: 0 }),
  );
  assert.equal(
    e.key('t', { ctrlKey: true, shiftKey: true }).defaultPrevented,
    true,
  );
  e.key('t', { ctrlKey: true, shiftKey: true, repeat: true });
  assert.equal(e.type('!').defaultPrevented, true);
  assert.equal(e.textarea.value, '!abc!');
});

test('mouse toggle accepts modifiers and non-left buttons and can remove a cursor', () => {
  for (const button of [0, 1, 2, 3, 4]) {
    const e = editor('abc');
    e.configure({
      toggleBinding: { key: `Mouse${button}`, ctrl: true, alt: true },
    });
    e.textarea.setSelectionRange(3, 3);
    e.fire('selectionchange');
    const pointer = () =>
      e.fire(
        'pointerdown',
        new e.TestEvent('pointerdown', { button, ctrlKey: true, altKey: true }),
      );
    assert.equal(pointer().defaultPrevented, true);
    if (button === 1 || button === 2) {
      assert.equal(
        e.fire(
          button === 2 ? 'contextmenu' : 'auxclick',
          new e.TestEvent('auxclick', { button, ctrlKey: true, altKey: true }),
        ).defaultPrevented,
        true,
      );
    }
    assert.equal(pointer().defaultPrevented, true);
    assert.equal(e.type('!').defaultPrevented, false);
  }
});

test('composition commits across cursors and undo restores the pre-composition snapshot', async () => {
  const e = editor('a\na');
  e.key('ArrowDown', { altKey: true, metaKey: true });
  e.fire('compositionstart');
  // The browser edits the primary selection while composition is in progress.
  e.textarea.value = '漢a\na';
  e.textarea.setSelectionRange(1, 1);
  e.fire(
    'input',
    new e.TestEvent('input', {
      inputType: 'insertCompositionText',
      data: '漢',
    }),
  );
  e.fire('compositionend', new e.TestEvent('compositionend', { data: '漢' }));
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  assert.equal(e.textarea.value, '漢a\n漢a');
  assert.deepEqual(e.transactions, ['漢a\na']);
  e.textarea.value = 'a\na';
  e.fire('input', new e.TestEvent('input', { inputType: 'historyUndo' }));
  e.type('!');
  assert.equal(e.textarea.value, '!a\n!a');
});

test('canceling composition preserves selected text and all cursors', async () => {
  const e = editor('ab\ncd');
  e.textarea.setSelectionRange(0, 1);
  e.fire('selectionchange');
  e.key('ArrowDown', { altKey: true, metaKey: true });
  e.fire('compositionstart');
  e.fire('compositionend', new e.TestEvent('compositionend', { data: '' }));
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  assert.equal(e.textarea.value, 'ab\ncd');
  assert.deepEqual(e.transactions, []);
  assert.equal(e.textarea.selectionStart, 0);
  assert.equal(e.textarea.selectionEnd, 1);
  e.type('!');
  assert.equal(e.textarea.value, '!b\nc!d');
});

test('canceling composition restores the snapshot after provisional native edits', async () => {
  const e = editor('a\na');
  e.key('ArrowDown', { altKey: true, metaKey: true });
  e.fire('compositionstart');
  e.textarea.value = '漢a\na';
  e.textarea.setSelectionRange(1, 1);
  e.fire(
    'input',
    new e.TestEvent('input', {
      inputType: 'insertCompositionText',
      data: '漢',
    }),
  );
  e.fire('compositionend', new e.TestEvent('compositionend', { data: '' }));
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  assert.equal(e.textarea.value, 'a\na');
  e.type('!');
  assert.equal(e.textarea.value, '!a\n!a');
});

test('paste undo restores all cursors even before any multi-cursor typing', () => {
  const e = editor('a\na');
  e.key('ArrowDown', { altKey: true, metaKey: true });
  e.fire(
    'paste',
    new e.TestEvent('paste', { clipboardData: { getData: () => 'x\ny' } }),
  );
  e.textarea.value = e.transactions.pop()!;
  e.fire('input', new e.TestEvent('input', { inputType: 'historyUndo' }));
  e.type('!');
  assert.equal(e.textarea.value, '!a\n!a');
});

test('cut preserves a mixed selection and cursor through undo', () => {
  const e = editor('ab\ncd');
  e.textarea.setSelectionRange(0, 1);
  e.fire('selectionchange');
  e.key('ArrowDown', { altKey: true, metaKey: true });
  let copied = '';
  const cut = e.fire(
    'cut',
    new e.TestEvent('cut', {
      clipboardData: {
        getData: () => '',
        setData: (_type, value) => {
          copied = value;
        },
      },
    }),
  );
  assert.equal(cut.defaultPrevented, true);
  assert.equal(copied, 'a\n');
  assert.equal(e.textarea.value, 'b\ncd');
  e.textarea.value = e.transactions.pop()!;
  e.fire('input', new e.TestEvent('input', { inputType: 'historyUndo' }));
  e.type('!');
  assert.equal(e.textarea.value, '!b\nc!d');
});

for (const inputType of [
  'insertLineBreak',
  'insertParagraph',
  'insertReplacementText',
]) {
  test(`${inputType} remains one transaction across cursors`, () => {
    const e = editor('a\na');
    e.key('ArrowDown', { altKey: true, metaKey: true });
    const event = e.fire(
      'beforeinput',
      new e.TestEvent('beforeinput', { inputType, data: 'x' }),
    );
    assert.equal(event.defaultPrevented, true);
    assert.equal(
      e.textarea.value,
      inputType === 'insertReplacementText' ? 'xa\nxa' : '\na\n\na',
    );
    assert.deepEqual(e.transactions, ['a\na']);
  });
}

test('fallback writes retain all cursors when the native editing command is unavailable', () => {
  const e = editor('a\na', 'MacIntel', false);
  e.key('ArrowDown', { altKey: true, metaKey: true });
  assert.equal(e.type('!').defaultPrevented, true);
  e.type('?');
  assert.equal(e.textarea.value, '!?a\n!?a');
});
