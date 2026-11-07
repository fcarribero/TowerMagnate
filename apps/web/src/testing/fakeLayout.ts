import { afterAll, beforeAll } from 'vitest';

const SIZE_PROPERTIES = ['clientWidth', 'clientHeight', 'offsetWidth', 'offsetHeight'] as const;

export type LayoutSizes = Record<(typeof SIZE_PROPERTIES)[number], number>;

/**
 * jsdom does no layout. For the tests of the calling file, every element
 * reports these sizes: client sizes stand for the window layer, offset sizes
 * for a window frame.
 */
export function useFakeLayoutSizes(sizes: LayoutSizes): void {
  const originals = new Map<string, PropertyDescriptor | undefined>();

  beforeAll(() => {
    for (const property of SIZE_PROPERTIES) {
      originals.set(property, Object.getOwnPropertyDescriptor(HTMLElement.prototype, property));
      Object.defineProperty(HTMLElement.prototype, property, {
        configurable: true,
        get: () => sizes[property],
      });
    }
  });

  afterAll(() => {
    for (const property of SIZE_PROPERTIES) {
      const original = originals.get(property);
      if (original === undefined) {
        Reflect.deleteProperty(HTMLElement.prototype, property);
      } else {
        Object.defineProperty(HTMLElement.prototype, property, original);
      }
    }
  });
}
