import '../editor/content.ts';
import * as S from '../settings.ts';
import type { ActionId } from '../settings.ts';
(async () => {
  const platform = S.detectPlatform();
  const status = document.querySelector<HTMLElement>('#status')!;
  const practiceStatus =
    document.querySelector<HTMLElement>('#practice-status')!;
  const playground =
    document.querySelector<HTMLTextAreaElement>('#playground')!;
  let tutorial = '';
  function updateTutorial() {
    const above = settings.bindings.addAbove;
    const below = settings.bindings.addBelow;
    const next = [
      'Try multi-cursor editing here.',
      '',
      above
        ? `Press ${S.label(above, platform)} to add a cursor above.`
        : 'Assign a shortcut to add a cursor above.',
      below
        ? `Press ${S.label(below, platform)} to add a cursor below.`
        : 'Assign a shortcut to add a cursor below.',
      settings.toggleBinding
        ? `Point at a location and press ${S.label(settings.toggleBinding, platform)} to add or remove a cursor.`
        : 'Assign a shortcut to toggle a cursor at the pointer location.',
      'Then type to edit at every cursor at once.',
      'Hold Shift with an add-cursor shortcut to extend selections.',
      'Press Escape to return to a single cursor.',
    ].join('\n');
    if (playground.value === tutorial) playground.value = next;
    tutorial = next;
  }
  const save = document.querySelector<HTMLButtonElement>('#save')!;
  const monospace = document.querySelector<HTMLInputElement>('#monospace')!;
  const noWrap = document.querySelector<HTMLInputElement>('#no-wrap')!;
  const reset = document.querySelector<HTMLButtonElement>('#reset')!;
  let settings = S.normalize({}, platform);
  type ShortcutId = ActionId | 'toggle';
  let savedSettings = settings;
  let recording: ShortcutId | null = null;
  const buttons = new Map<ShortcutId, HTMLButtonElement>();
  const disableButtons = new Map<ShortcutId, HTMLButtonElement>();
  function message(text: string, error = false) {
    status.textContent = text;
    status.classList.toggle('error', error);
  }
  function stop() {
    if (recording) {
      const button = buttons.get(recording)!;
      button.classList.remove('recording');
      button.textContent =
        recording === 'toggle'
          ? S.label(settings.toggleBinding, platform)
          : S.label(settings.bindings[recording], platform);
      recording = null;
    }
  }
  for (const [id, selector] of [
    ['addBelow', '#add-below-shortcut'],
    ['addAbove', '#add-above-shortcut'],
    ['toggle', '#toggle-shortcut'],
  ] as const) {
    const button = document.querySelector<HTMLButtonElement>(selector)!;
    button.type = 'button';
    button.disabled = true;
    button.addEventListener('click', () => {
      stop();
      recording = id;
      button.classList.add('recording');
      button.textContent = 'Press shortcut…';
      message(
        id === 'toggle'
          ? 'Press a key combination or click a mouse button with optional modifiers.'
          : 'Press keys to assign shortcuts.',
      );
    });
    button.addEventListener('blur', stop);
    buttons.set(id, button);
    const disable = document.querySelector<HTMLButtonElement>(
      selector + '-disable',
    )!;
    disableButtons.set(id, disable);
    disable.addEventListener('click', () => {
      stop();
      settings =
        id === 'toggle'
          ? { ...settings, toggleBinding: null }
          : { ...settings, bindings: { ...settings.bindings, [id]: null } };
      draw();
      message('Shortcut disabled. Save to apply.');
    });
  }
  let capturedMouseButton: number | null = null;
  function assign(binding: S.Binding) {
    if (!recording) return;
    const error = S.bindingError(binding, recording, platform);
    if (error) {
      message(error, true);
      return;
    }
    settings = S.assign(settings, recording, binding, platform);
    stop();
    draw();
    message('Shortcut changed. Save to apply.');
  }
  function draw() {
    for (const [id, button] of buttons)
      button.textContent = S.label(
        id === 'toggle' ? settings.toggleBinding : settings.bindings[id],
        platform,
      );
    for (const [id, button] of disableButtons)
      button.disabled = !(id === 'toggle'
        ? settings.toggleBinding
        : settings.bindings[id]);
    monospace.checked = settings.monospace;
    noWrap.checked = settings.noWrap;
  }
  function reportPractice(event: Event, action: string) {
    setTimeout(() => {
      practiceStatus.textContent = event.defaultPrevented
        ? action + ' shortcut received.'
        : 'Shortcut did not activate. Check the binding and try again.';
    });
  }
  // Record before the playground editor can consume an existing shortcut.
  window.addEventListener(
    'keydown',
    (e) => {
      if (!recording) {
        if (e.target === playground && !e.repeat) {
          const action = S.resolve(e, savedSettings);
          const toggle = S.matches(
            S.bindingFromEvent(e, e.key),
            savedSettings.toggleBinding,
          );
          if (action || toggle)
            reportPractice(
              e,
              action
                ? (e.shiftKey ? 'Extend selection' : 'Add cursor') +
                    (action === 'addAbove' ? ' above' : ' below')
                : 'Toggle cursor',
            );
        }
        return;
      }
      if (e.isComposing || e.getModifierState?.('AltGraph')) return;
      if (e.key === 'Tab') {
        stop();
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      if (['Meta', 'Alt', 'Control', 'Shift'].includes(e.key) || e.repeat)
        return;
      if (e.cancelable === false) {
        message(
          'This key combination cannot be captured reliably. Choose another shortcut.',
          true,
        );
        return;
      }
      if (e.shiftKey && recording !== 'toggle') {
        message(
          'Choose a shortcut without Shift. Shift extends selections.',
          true,
        );
        return;
      }
      assign(S.bindingFromEvent(e, e.key));
    },
    true,
  );
  window.addEventListener(
    'pointerdown',
    (e) => {
      capturedMouseButton = null;
      if (
        !recording &&
        e.target === playground &&
        S.matches(
          S.bindingFromEvent(e, 'Mouse' + e.button),
          savedSettings.toggleBinding,
        )
      )
        reportPractice(e, 'Toggle cursor');
      if (recording !== 'toggle' || e.button < 0 || e.button > 4) return;
      if ([...disableButtons.values()].some((button) => button === e.target))
        return;
      e.preventDefault();
      e.stopImmediatePropagation();
      capturedMouseButton = e.button;
      assign(S.bindingFromEvent(e, `Mouse${e.button}`));
    },
    true,
  );
  for (const type of ['click', 'contextmenu', 'auxclick'] as const) {
    window.addEventListener(
      type,
      (e) => {
        if (e.button !== capturedMouseButton) return;
        e.preventDefault();
        e.stopImmediatePropagation();
      },
      true,
    );
  }
  document.querySelector('#settings')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    stop();
    settings.monospace = monospace.checked;
    settings.noWrap = noWrap.checked;
    try {
      const snapshot = S.normalize(settings, platform);
      await chrome.storage.local.set({ settings: snapshot });
      savedSettings = snapshot;
      practiceStatus.textContent = '';
      updateTutorial();
      message('Settings saved.');
    } catch {
      message('Could not save settings. Please try again.', true);
    }
  });
  reset.addEventListener('click', () => {
    stop();
    settings = S.normalize({}, platform);
    draw();
    message('Defaults restored. Save to apply.');
  });
  try {
    settings = S.normalize(
      (await chrome.storage.local.get('settings')).settings,
      platform,
    );
    savedSettings = settings;
    draw();
    updateTutorial();
    for (const button of buttons.values()) button.disabled = false;
    save.disabled = false;
    reset.disabled = false;
    message('');
  } catch {
    message('Could not load settings. Reload this page to try again.', true);
  }
})();
