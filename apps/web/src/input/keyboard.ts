const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target instanceof HTMLInputElement) {
    return !NON_TEXT_INPUT_TYPES.has(target.type);
  }
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    return true;
  }
  return isContentEditable(target);
}

function isContentEditable(element: HTMLElement): boolean {
  if (element.isContentEditable) {
    return true;
  }
  const editableAncestor = element.closest('[contenteditable]');
  return editableAncestor !== null && editableAncestor.getAttribute('contenteditable') !== 'false';
}

/**
 * Game shortcuts must not fire while the player types, nor steal browser
 * shortcuts such as Ctrl + =.
 */
export function isShortcutBlocked(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey || event.altKey || isTextEntryTarget(event.target);
}
