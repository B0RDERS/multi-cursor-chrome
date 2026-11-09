import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { transformSync } from 'esbuild';
import * as S from '../src/settings.ts';

type TestEvent = Partial<KeyboardEvent & PointerEvent>;
type Handler = (event: TestEvent) => void | Promise<void>;

test('shortcut recording overrides an existing Command–Option–Up binding', async () => {
  const nodes = new Map<string, Element>();
  class Element {
    textContent = '';
    value = '';
    checked = false;
    disabled = false;
    handlers = new Map<string, Handler>();
    classList = { add() {}, remove() {}, toggle() {} };
    addEventListener(type: string, handler: Handler) {
      this.handlers.set(type, handler);
    }
  }
  const document = {
    querySelector(selector: string) {
      if (!nodes.has(selector)) nodes.set(selector, new Element());
      return nodes.get(selector)!;
    },
  };
  let persisted: unknown;
  let keydown: Handler = () => {};
  let capture = false;
  let pointerdown: typeof keydown = () => {};
  const source = readFileSync(
    new URL('../src/home/home.ts', import.meta.url),
    'utf8',
  ).replace(/^import .*;\n/gm, '');
  new Script(transformSync(source, { loader: 'ts' }).code).runInNewContext({
    S: { ...S, detectPlatform: () => 'mac' },
    document,
    setTimeout,
    window: {
      addEventListener(
        type: string,
        handler: typeof keydown,
        useCapture: boolean,
      ) {
        if (type === 'keydown') {
          keydown = handler;
          capture = useCapture;
        }
        if (type === 'pointerdown') pointerdown = handler;
      },
    },
    chrome: {
      storage: {
        local: {
          get: async () => ({}),
          set: async (value: unknown) => {
            persisted = value;
          },
        },
      },
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  const below = nodes.get('#add-below-shortcut')!;
  const above = nodes.get('#add-above-shortcut')!;
  const playground = nodes.get('#playground')!;
  assert.match(playground.value, /Option \+ Command \+ Down/);
  assert.match(playground.value, /Option \+ Left click/);
  below.handlers.get('click')!({});
  keydown({
    key: 't',
    metaKey: true,
    preventDefault() {},
    stopImmediatePropagation() {},
  });
  assert.match(nodes.get('#status')!.textContent, /reserved by the browser/);
  assert.equal(above.textContent, 'Option + Command + Up');
  assert.equal(below.textContent, 'Press shortcut…');
  let prevented = false;
  let stopped = false;
  keydown({
    key: 'ArrowUp',
    metaKey: true,
    altKey: true,
    ctrlKey: false,
    shiftKey: false,
    preventDefault() {
      prevented = true;
    },
    stopImmediatePropagation() {
      stopped = true;
    },
  });
  assert.equal(capture, true);
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(below.textContent, 'Option + Command + Up');
  assert.equal(above.textContent, 'Not assigned');
  assert.equal(
    nodes.get('#status')!.textContent,
    'Shortcut changed. Save to apply.',
  );
  const click = nodes.get('#toggle-shortcut')!;
  click.handlers.get('click')!({});
  keydown({
    key: 't',
    ctrlKey: true,
    shiftKey: true,
    preventDefault() {},
    stopImmediatePropagation() {},
  });
  assert.equal(click.textContent, 'Control + Shift + t');
  await nodes.get('#settings')!.handlers.get('submit')!({
    preventDefault() {},
  });
  assert.match(playground.value, /Control \+ Shift \+ t/);
  assert.match(playground.value, /Assign a shortcut to add a cursor above/);
  click.handlers.get('click')!({});
  pointerdown({
    button: 2,
    altKey: true,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    preventDefault() {},
    stopImmediatePropagation() {},
  });
  assert.equal(click.textContent, 'Control + Option + Right click');
  await nodes.get('#settings')!.handlers.get('submit')!({
    preventDefault() {},
  });
  assert.match(playground.value, /Control \+ Option \+ Right click/);
  keydown({
    target: playground as unknown as EventTarget,
    key: 'ArrowUp',
    metaKey: true,
    altKey: true,
    ctrlKey: false,
    shiftKey: true,
    defaultPrevented: true,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(
    nodes.get('#practice-status')!.textContent,
    'Extend selection below shortcut received.',
  );
  const disable = nodes.get('#toggle-shortcut-disable')!;
  disable.handlers.get('click')!({});
  assert.equal(click.textContent, 'Not assigned');
  assert.equal(disable.disabled, true);
  await nodes.get('#settings')!.handlers.get('submit')!({
    preventDefault() {},
  });
  assert.equal(
    (persisted as { settings: S.Settings }).settings.toggleBinding,
    null,
  );
  playground.value = 'My practice text';
  nodes.get('#reset')!.handlers.get('click')!({});
  await nodes.get('#settings')!.handlers.get('submit')!({
    preventDefault() {},
  });
  assert.equal(playground.value, 'My practice text');
});
