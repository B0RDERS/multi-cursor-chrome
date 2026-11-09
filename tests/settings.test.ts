import * as fs from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/settings.ts';

const event = (key: string, mods: Partial<S.KeyEvent> = {}) => ({
  key,
  metaKey: false,
  altKey: false,
  ctrlKey: false,
  shiftKey: false,
  ...mods,
});
test('add cursor supports Shift without changing the action', () =>
  assert.equal(
    S.resolve(
      event('ArrowDown', { metaKey: true, altKey: true, shiftKey: true }),
      S.normalize({}, 'mac'),
    ),
    'addBelow',
  ));
test('custom binding replaces original binding', () => {
  const settings = S.normalize(
    {
      bindings: { addBelow: { key: 'j', ctrl: true } },
    },
    'mac',
  );
  assert.equal(S.resolve(event('j', { ctrlKey: true }), settings), 'addBelow');
  assert.equal(
    S.resolve(event('ArrowDown', { metaKey: true, altKey: true }), settings),
    undefined,
  );
});
test('invalid stored shortcuts use current defaults', () => {
  const settings = S.normalize(
    {
      bindings: { addBelow: { key: 123 }, addAbove: { key: 'Mouse0' } },
      toggleBinding: { key: 'Mouse9' },
    },
    'mac',
  );
  assert.deepEqual(settings, S.getDefaults('mac'));
});
test('all manifest resources exist', () => {
  const root = new URL('../dist/', import.meta.url);
  const manifest = JSON.parse(
    fs.readFileSync(new URL('manifest.json', root), 'utf8'),
  );
  assert.equal(manifest.name, 'Multi-Cursor Textareas');
  for (const file of [
    ...manifest.content_scripts[0].js,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
    manifest.options_ui.page,
    manifest.background.service_worker,
  ])
    assert.ok(fs.existsSync(new URL(file, root)), file);
});

test('appearance settings default to off and require explicit boolean true', () => {
  assert.equal(S.normalize().monospace, false);
  assert.equal(S.normalize().noWrap, false);
  assert.equal(S.normalize({ monospace: 'true', noWrap: 1 }).monospace, false);
  assert.equal(S.normalize({ monospace: 'true', noWrap: 1 }).noWrap, false);
  assert.equal(S.normalize({ monospace: true, noWrap: true }).monospace, true);
  assert.equal(S.normalize({ monospace: true, noWrap: true }).noWrap, true);
});

test('new shortcut overrides the existing action and stays cleared after saving', () => {
  const assigned = S.assign(
    S.normalize({}, 'mac'),
    'addBelow',
    {
      key: 'ArrowUp',
      meta: true,
      alt: true,
      ctrl: false,
      shift: false,
    },
    'mac',
  );
  const restored = S.normalize(JSON.parse(JSON.stringify(assigned)), 'mac');
  assert.equal(restored.bindings.addAbove, null);
  assert.equal(S.label(restored.bindings.addAbove), 'Not assigned');
  assert.equal(
    S.resolve(event('ArrowUp', { metaKey: true, altKey: true }), restored),
    'addBelow',
  );
  assert.equal(
    S.resolve(
      event('ArrowUp', { metaKey: true, altKey: true, shiftKey: true }),
      restored,
    ),
    'addBelow',
  );
  assert.equal(
    S.resolve(event('ArrowDown', { metaKey: true, altKey: true }), restored),
    undefined,
  );
  assert.deepEqual(S.normalize().bindings, S.getDefaults().bindings);
});

for (const platform of ['mac', 'windows', 'linux'] as const) {
  test(`${platform} defaults work in both directions with Shift selection support`, () => {
    const settings = S.normalize({}, platform);
    const modifiers = {
      altKey: true,
      metaKey: platform === 'mac',
    };
    assert.equal(
      S.resolve(event('ArrowDown', modifiers), settings),
      'addBelow',
    );
    assert.equal(S.resolve(event('ArrowUp', modifiers), settings), 'addAbove');
    assert.equal(
      S.resolve(event('ArrowDown', { ...modifiers, shiftKey: true }), settings),
      'addBelow',
    );
    assert.equal(settings.toggleBinding?.key, 'Mouse0');
    assert.equal(settings.toggleBinding?.alt, true);
  });
  test(`${platform} retains saved custom shortcuts`, () => {
    const settings = S.normalize(
      {
        bindings: {
          addBelow: { key: 'm', ctrl: true },
          addAbove: { key: 'k', alt: true, meta: platform === 'mac' },
        },
      },
      platform,
    );
    assert.equal(
      S.resolve(event('m', { ctrlKey: true }), settings),
      'addBelow',
    );
    assert.equal(
      S.resolve(
        event('k', { altKey: true, metaKey: platform === 'mac' }),
        settings,
      ),
      'addAbove',
    );
  });
}

test('platform detection prefers client hints and falls back to navigator platform', () => {
  assert.equal(
    S.detectPlatform({
      userAgentData: { platform: 'Windows' },
      platform: 'MacIntel',
    }),
    'windows',
  );
  assert.equal(S.detectPlatform({ platform: 'MacIntel' }), 'mac');
  assert.equal(S.detectPlatform({ platform: 'Win32' }), 'windows');
  assert.equal(S.detectPlatform({ platform: 'Linux x86_64' }), 'linux');
  assert.equal(S.detectPlatform({ userAgent: 'X11; Linux x86_64' }), 'linux');
});

test('shortcut labels use platform terminology', () => {
  assert.equal(
    S.label(S.getDefaults('mac').bindings.addBelow, 'mac'),
    'Option + Command + Down',
  );
  assert.equal(
    S.label(S.getDefaults('windows').bindings.addBelow, 'windows'),
    'Alt + Down',
  );
  assert.equal(
    S.label(S.getDefaults('linux').bindings.addAbove, 'linux'),
    'Alt + Up',
  );
  assert.equal(S.modifierLabel('meta', 'windows'), 'Windows');
  assert.equal(S.modifierLabel('meta', 'linux'), 'Super');
});

test('restoring defaults creates independent bindings for the detected platform', () => {
  const modified = S.normalize({}, 'windows');
  assert.ok(modified.bindings.addBelow);
  modified.bindings.addBelow.key = 'j';
  assert.equal(S.normalize({}, 'windows').bindings.addBelow?.key, 'ArrowDown');
  assert.equal(S.normalize({}, 'windows').bindings.addBelow?.alt, true);
});

test('toggle bindings preserve keyboard and mouse combinations', () => {
  for (const key of ['t', 'Mouse0', 'Mouse1', 'Mouse2', 'Mouse3', 'Mouse4']) {
    const binding = { key, ctrl: true, alt: true, meta: false, shift: true };
    const settings = S.normalize({ toggleBinding: binding }, 'mac');
    assert.deepEqual(settings.toggleBinding, binding);
    assert.equal(
      S.matches(
        S.bindingFromEvent(
          event(key, { ctrlKey: true, altKey: true, shiftKey: true }),
          key,
        ),
        settings.toggleBinding,
      ),
      true,
    );
    assert.equal(
      S.matches(
        S.bindingFromEvent(event(key, { ctrlKey: true, altKey: true }), key),
        settings.toggleBinding,
      ),
      false,
    );
  }
  assert.equal(S.normalize({ toggleBinding: null }).toggleBinding, null);
  assert.equal(
    S.normalize({ toggleBinding: { key: 'Mouse9' } }).toggleBinding?.key,
    'Mouse0',
  );
});
test('toggle and add bindings replace conflicting shortcuts in either direction', () => {
  const binding = S.getDefaults('mac').bindings.addAbove!;
  const toggled = S.assign(
    S.normalize({}, 'mac'),
    'toggle',
    {
      ...binding,
      shift: true,
    },
    'mac',
  );
  assert.equal(toggled.bindings.addAbove, null);
  assert.equal(
    S.assign(toggled, 'addBelow', binding, 'mac').toggleBinding,
    null,
  );
});

for (const platform of ['mac', 'windows', 'linux'] as const) {
  test(`${platform} rejects reserved bindings at assignment and storage boundaries`, () => {
    const defaults = S.getDefaults(platform);
    const command = platform === 'mac' ? { meta: true } : { ctrl: true };
    for (const candidate of [
      { key: 't', ...command },
      { key: 'w', ...command, shift: true },
      { key: 'l', ...command },
      { key: 'F5' },
      { key: 'F12' },
      { key: 'Dead' },
      { key: 'Unidentified' },
      { key: 'AltGraph' },
      { key: 'Tab', ctrl: true },
    ]) {
      const binding = {
        meta: false,
        ctrl: false,
        alt: false,
        shift: false,
        ...candidate,
      };
      assert.ok(
        S.bindingError(binding, 'toggle', platform),
        JSON.stringify(binding),
      );
      assert.throws(() => S.assign(defaults, 'toggle', binding, platform));
      assert.deepEqual(
        S.normalize({ toggleBinding: binding }, platform).toggleBinding,
        defaults.toggleBinding,
      );
    }
    // Adding cursors reserves Shift too: Ctrl+Shift+J opens developer tools.
    assert.ok(
      S.bindingError(
        {
          key: 'j',
          meta: platform === 'mac',
          ctrl: platform !== 'mac',
          alt: false,
          shift: false,
        },
        'addBelow',
        platform,
      ),
    );
    assert.equal(
      S.bindingError(defaults.bindings.addBelow!, 'addBelow', platform),
      null,
    );
  });
}

test('normal editing shortcuts remain available and old Ctrl+Alt arrows fall back', () => {
  for (const platform of ['mac', 'windows', 'linux'] as const) {
    const command = platform === 'mac' ? { meta: true } : { ctrl: true };
    for (const key of ['a', 'c', 'v', 'x', 'z', 'y']) {
      assert.ok(
        S.bindingError(
          {
            key,
            meta: false,
            ctrl: false,
            alt: false,
            shift: false,
            ...command,
          },
          'addBelow',
          platform,
        ),
      );
    }
    assert.ok(
      S.bindingError(
        { key: 'a', meta: false, ctrl: false, alt: false, shift: false },
        'toggle',
        platform,
      ),
    );
    if (platform !== 'mac')
      assert.deepEqual(
        S.normalize(
          {
            bindings: { addBelow: { key: 'ArrowDown', ctrl: true, alt: true } },
          },
          platform,
        ),
        S.getDefaults(platform),
      );
  }
});
