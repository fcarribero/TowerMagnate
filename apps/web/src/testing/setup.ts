// jsdom has no pointer events. Preact only binds lowercase event names that
// exist as `on*` properties, so both the class and the properties are needed.
class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
  }
}

if (typeof window !== 'undefined' && typeof window.PointerEvent === 'undefined') {
  window.PointerEvent = TestPointerEvent as typeof PointerEvent;
  for (const name of ['onpointerdown', 'onpointermove', 'onpointerup', 'onpointercancel']) {
    Object.defineProperty(HTMLElement.prototype, name, {
      configurable: true,
      writable: true,
      value: null,
    });
  }
}
