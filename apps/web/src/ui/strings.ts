import { SPANISH_STRINGS } from './spanishStrings';

export type StringKey = keyof typeof SPANISH_STRINGS;

export type StringParams = Readonly<Record<string, string | number>>;

const PLACEHOLDER = /\{(\w+)\}/g;

/** Looks up a text and fills its `{name}` placeholders. Unknown placeholders stay as written. */
export function t(key: StringKey, params: StringParams = {}): string {
  return SPANISH_STRINGS[key].replace(PLACEHOLDER, (placeholder, name: string) => {
    const value = params[name];
    return value === undefined ? placeholder : String(value);
  });
}

export function hasString(key: string): key is StringKey {
  return Object.hasOwn(SPANISH_STRINGS, key);
}

export function stringKeys(): StringKey[] {
  return Object.keys(SPANISH_STRINGS) as StringKey[];
}

/** The message for a rejected command; codes without a text get the generic one. */
export function errorText(code: string): string {
  const key = `error.${code}`;
  return hasString(key) ? t(key) : t('error.unknown');
}
