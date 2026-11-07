const TEXT_FIELD_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export interface KeyPress {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  target: EventTarget | null;
}

/** M opens or closes the tower map, unless the player is typing in a field. */
export function isMapToggleKey(event: KeyPress): boolean {
  if (event.key.toLowerCase() !== 'm' || event.ctrlKey || event.altKey || event.metaKey) {
    return false;
  }
  const tag = (event.target as { tagName?: string } | null)?.tagName;
  return tag === undefined || !TEXT_FIELD_TAGS.has(tag);
}
