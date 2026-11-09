export interface Binding {
  key: string;
  meta: boolean;
  alt: boolean;
  ctrl: boolean;
  shift: boolean;
}
export type KeyEvent = Pick<
  KeyboardEvent,
  'key' | 'metaKey' | 'altKey' | 'ctrlKey' | 'shiftKey'
>;
export type Platform = 'mac' | 'windows' | 'linux';
interface PlatformNavigator {
  userAgentData?: { platform?: string };
  platform?: string;
  userAgent?: string;
}

export function detectPlatform(
  browser: PlatformNavigator = typeof navigator === 'undefined'
    ? {}
    : navigator,
): Platform {
  const platform =
    browser.userAgentData?.platform ||
    browser.platform ||
    browser.userAgent ||
    '';
  if (/mac|darwin|iphone|ipad|ipod/i.test(platform)) return 'mac';
  if (/win/i.test(platform)) return 'windows';
  return 'linux';
}

type Modifier = 'alt' | 'meta' | 'ctrl';
export interface Settings {
  bindings: Record<ActionId, Binding | null>;
  toggleBinding: Binding | null;
  monospace: boolean;
  noWrap: boolean;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
const key = (
  key: string,
  meta = false,
  alt = false,
  ctrl = false,
  shift = false,
): Binding => ({ key, meta, alt, ctrl, shift });
export const actionIds = ['addBelow', 'addAbove'] as const;
export type ActionId = (typeof actionIds)[number];

export function getDefaults(platform: Platform = detectPlatform()): Settings {
  const mac = platform === 'mac';
  return {
    bindings: {
      addBelow: key('ArrowDown', mac, true),
      addAbove: key('ArrowUp', mac, true),
    },
    toggleBinding: key('Mouse0', false, true),
    monospace: false,
    noWrap: false,
  };
}

/** Return a user-facing reason when a trigger cannot be used reliably. */
export function bindingError(
  binding: Binding,
  id: ActionId | 'toggle',
  platform: Platform = detectPlatform(),
): string | null {
  const k = binding.key.toLowerCase();
  if (/^mouse[0-4]$/.test(k)) {
    if (id !== 'toggle') return 'Mouse buttons can only toggle cursors.';
    if (!binding.meta && !binding.ctrl && !binding.alt && !binding.shift)
      return 'Add a modifier to preserve normal mouse actions.';
    return null;
  }
  if (
    !binding.key ||
    [
      'meta',
      'alt',
      'control',
      'shift',
      'altgraph',
      'dead',
      'unidentified',
      'process',
      'compose',
      'capslock',
      'numlock',
      'scrolllock',
      'pause',
      'printscreen',
      'contextmenu',
      'tab',
      'escape',
    ].includes(k) ||
    (!/^.$/u.test(binding.key) &&
      ![
        'arrowup',
        'arrowdown',
        'arrowleft',
        'arrowright',
        'home',
        'end',
        'pageup',
        'pagedown',
        'backspace',
        'delete',
        'enter',
      ].includes(k))
  )
    return 'This key cannot be used reliably. Choose another shortcut.';
  if (id !== 'toggle' && binding.shift)
    return 'Choose a shortcut without Shift. Shift extends selections.';
  if (platform !== 'mac' && binding.meta)
    return 'Windows/Super shortcuts are reserved by the operating system.';
  if (
    (binding.alt &&
      ['tab', 'escape', 'f4', ' ', 'home', 'arrowleft', 'arrowright'].includes(
        k,
      )) ||
    (platform === 'mac' &&
      binding.meta &&
      [' ', 'tab', 'q', 'h', 'm', 'backspace'].includes(k)) ||
    (binding.ctrl && ['escape', 'tab', 'pageup', 'pagedown'].includes(k))
  )
    return 'This shortcut is reserved by the browser or operating system.';
  const command = platform === 'mac' ? binding.meta : binding.ctrl;
  if (
    (!binding.ctrl && !binding.alt && !binding.meta) ||
    (command &&
      !binding.alt &&
      ['a', 'c', 'v', 'x', 'z', 'y', 'insert'].includes(k)) ||
    (binding.shift && ['insert', 'delete'].includes(k))
  )
    return 'This shortcut is needed for normal editing. Choose another combination.';
  if (platform !== 'mac' && binding.ctrl && binding.alt)
    return 'Ctrl + Alt shortcuts can conflict with AltGr or system shortcuts.';
  if (id !== 'toggle' && /^.$/u.test(k) && !/^[a-z]$/.test(k))
    return 'Choose a letter or navigation key that also works with Shift.';

  if (
    command &&
    ((!binding.alt &&
      'twnlroqpfghjkdsueiyb0123456789+-=,!@#$%^&*()_<>'.includes(k)) ||
      (binding.alt && ['i', 'j', 'u', 'c'].includes(k)))
  )
    return 'This shortcut is reserved by the browser. Choose another combination.';
  if (
    platform === 'mac' &&
    binding.alt &&
    !binding.meta &&
    !binding.ctrl &&
    /^.$/u.test(binding.key)
  )
    return 'Option character shortcuts depend on the keyboard layout. Add Control or Command.';
  return null;
}

export function normalize(
  raw: unknown = {},
  platform: Platform = detectPlatform(),
): Settings {
  const defaults = getDefaults(platform);
  const bindings = defaults.bindings;
  const stored = isRecord(raw) ? raw : {};
  const storedBindings = isRecord(stored.bindings) ? stored.bindings : {};
  for (const id of actionIds)
    bindings[id] = normalizeBinding(
      storedBindings[id],
      bindings[id],
      false,
      platform,
    );
  return {
    bindings,
    toggleBinding: normalizeBinding(
      stored.toggleBinding,
      defaults.toggleBinding,
      true,
      platform,
    ),
    monospace: stored.monospace === true,
    noWrap: stored.noWrap === true,
  };
}
function normalizeBinding(
  raw: unknown,
  fallback: Binding | null,
  toggle: boolean,
  platform: Platform,
): Binding | null {
  if (raw === null) return null;
  if (
    !isRecord(raw) ||
    typeof raw.key !== 'string' ||
    !raw.key ||
    ['Meta', 'Alt', 'Control', 'Shift'].includes(raw.key) ||
    (raw.key.startsWith('Mouse') && (!toggle || !/^Mouse[0-4]$/.test(raw.key)))
  )
    return fallback;
  const binding = {
    key: raw.key,
    meta: !!raw.meta,
    alt: !!raw.alt,
    ctrl: !!raw.ctrl,
    shift: !!raw.shift,
  };
  return bindingError(binding, toggle ? 'toggle' : 'addBelow', platform)
    ? fallback
    : binding;
}

export function bindingFromEvent(
  event: Pick<KeyEvent, 'metaKey' | 'altKey' | 'ctrlKey' | 'shiftKey'>,
  key: string,
): Binding {
  return {
    key,
    meta: event.metaKey,
    alt: event.altKey,
    ctrl: event.ctrlKey,
    shift: event.shiftKey,
  };
}

export function matches(a: Binding, b: Binding | null, ignoreShift = false) {
  return (
    b !== null &&
    a.key.toLowerCase() === b.key.toLowerCase() &&
    a.meta === b.meta &&
    a.alt === b.alt &&
    a.ctrl === b.ctrl &&
    (ignoreShift || a.shift === b.shift)
  );
}
export function resolve(event: KeyEvent, settings: Settings) {
  const binding = bindingFromEvent(event, event.key);
  return actionIds.find((id) => matches(binding, settings.bindings[id], true));
}
export function modifierLabel(
  modifier: Modifier,
  platform: Platform = detectPlatform(),
): string {
  if (modifier === 'alt') return platform === 'mac' ? 'Option' : 'Alt';
  if (modifier === 'ctrl') return platform === 'mac' ? 'Control' : 'Ctrl';
  return platform === 'mac'
    ? 'Command'
    : platform === 'windows'
      ? 'Windows'
      : 'Super';
}
export function label(
  b: Binding | null,
  platform: Platform = detectPlatform(),
) {
  if (!b) return 'Not assigned';
  return [
    b.ctrl ? modifierLabel('ctrl', platform) : null,
    b.alt ? modifierLabel('alt', platform) : null,
    b.shift ? 'Shift' : null,
    b.meta ? modifierLabel('meta', platform) : null,
    /^Mouse[0-4]$/.test(b.key)
      ? [
          'Left click',
          'Middle click',
          'Right click',
          'Mouse back',
          'Mouse forward',
        ][Number(b.key.slice(5))]
      : b.key.replace('Arrow', ''),
  ]
    .filter(Boolean)
    .join(' + ');
}
/** Assign any shortcut, clearing conflicting triggers across all actions. */
export function assign(
  settings: Settings,
  id: ActionId | 'toggle',
  binding: Binding,
  platform: Platform = detectPlatform(),
) {
  const error = bindingError(binding, id, platform);
  if (error) throw new Error(error);
  const next = normalize(settings, platform);
  for (const other of actionIds) {
    const existing = next.bindings[other];
    if (other !== id && existing && matches(binding, existing, true))
      next.bindings[other] = null;
  }
  if (id === 'toggle') next.toggleBinding = { ...binding };
  else {
    if (next.toggleBinding && matches(binding, next.toggleBinding, true))
      next.toggleBinding = null;
    next.bindings[id] = { ...binding, shift: false };
  }
  return next;
}
