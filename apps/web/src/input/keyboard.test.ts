import { afterEach, describe, expect, it } from 'vitest';
import { isShortcutBlocked, isTextEntryTarget } from './keyboard';

function mount<T extends HTMLElement>(element: T): T {
  document.body.append(element);
  return element;
}

function keyOn(target: HTMLElement, init: KeyboardEventInit = {}): KeyboardEvent {
  let received: KeyboardEvent | null = null;
  target.addEventListener('keydown', (event) => (received = event), { once: true });
  target.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true, ...init }));
  if (received === null) {
    throw new Error('keydown not received');
  }
  return received;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('isTextEntryTarget', () => {
  it('accepts text-like inputs, textareas and selects', () => {
    for (const type of ['text', 'number', 'password', 'search']) {
      const input = document.createElement('input');
      input.type = type;
      expect(isTextEntryTarget(input)).toBe(true);
    }
    expect(isTextEntryTarget(document.createElement('textarea'))).toBe(true);
    expect(isTextEntryTarget(document.createElement('select'))).toBe(true);
  });

  it('rejects buttons, radios, checkboxes and plain elements', () => {
    const radio = document.createElement('input');
    radio.type = 'radio';
    expect(isTextEntryTarget(radio)).toBe(false);
    expect(isTextEntryTarget(document.createElement('button'))).toBe(false);
    expect(isTextEntryTarget(document.createElement('div'))).toBe(false);
    expect(isTextEntryTarget(null)).toBe(false);
  });

  it('accepts content inside a contenteditable element', () => {
    const editor = mount(document.createElement('div'));
    editor.setAttribute('contenteditable', 'true');
    const child = document.createElement('span');
    editor.append(child);
    expect(isTextEntryTarget(child)).toBe(true);
    editor.setAttribute('contenteditable', 'false');
    expect(isTextEntryTarget(child)).toBe(false);
  });
});

describe('isShortcutBlocked', () => {
  it('lets a plain key on the page through', () => {
    expect(isShortcutBlocked(keyOn(mount(document.createElement('div'))))).toBe(false);
  });

  it('blocks keys typed in a text field', () => {
    expect(isShortcutBlocked(keyOn(mount(document.createElement('input'))))).toBe(true);
  });

  it('blocks keys held with Ctrl, Meta or Alt', () => {
    const canvas = mount(document.createElement('canvas'));
    expect(isShortcutBlocked(keyOn(canvas, { ctrlKey: true }))).toBe(true);
    expect(isShortcutBlocked(keyOn(canvas, { metaKey: true }))).toBe(true);
    expect(isShortcutBlocked(keyOn(canvas, { altKey: true }))).toBe(true);
  });
});
