const TEXT_FIELD_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export interface KeyPress {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  target: EventTarget | null;
}

/** A key pressed without modifiers while the player is not typing in a field. */
export function isPlainShortcut(event: KeyPress): boolean {
  if (event.ctrlKey || event.altKey || event.metaKey) {
    return false;
  }
  const tag = (event.target as { tagName?: string } | null)?.tagName;
  return tag === undefined || !TEXT_FIELD_TAGS.has(tag);
}

/** M opens or closes the tower map. */
export function isMapToggleKey(event: KeyPress): boolean {
  return event.key.toLowerCase() === 'm' && isPlainShortcut(event);
}

/** F opens or closes the finance window. */
export function isFinanceToggleKey(event: KeyPress): boolean {
  return event.key.toLowerCase() === 'f' && isPlainShortcut(event);
}
