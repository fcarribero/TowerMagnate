export const MAX_NAME_LENGTH = 24;

/**
 * Turns player input into a stored name: whitespace collapsed to single spaces, control
 * characters dropped, trimmed, and cut to MAX_NAME_LENGTH characters. An empty result is null,
 * which shows the default name.
 */
export function normalizeName(input: string): string | null {
  const singleLine = input
    .replace(/\s+/gu, ' ')
    .replace(/\p{Cc}/gu, '')
    .trim();
  const characters = Array.from(singleLine).slice(0, MAX_NAME_LENGTH);
  const name = characters.join('').trimEnd();
  return name === '' ? null : name;
}
