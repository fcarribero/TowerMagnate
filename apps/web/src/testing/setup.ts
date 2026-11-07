// jsdom has no pointer events. Preact only binds lowercase event names that
// exist as `on*` properties, so both the class and the properties are needed.
const POINTER_HANDLERS = [
  'onpointerdown',
  'onpointermove',
  'onpointerup',
  'onpointercancel',
  'onpointerenter',
  'onpointerleave',
];

function installPointerEvents(): void {
  class TestPointerEvent extends MouseEvent {
    readonly pointerId: number;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }

  window.PointerEvent = TestPointerEvent as typeof PointerEvent;
  for (const name of POINTER_HANDLERS) {
    Object.defineProperty(HTMLElement.prototype, name, {
      configurable: true,
      writable: true,
      value: null,
    });
  }
}

if (typeof window !== 'undefined' && typeof window.PointerEvent === 'undefined') {
  installPointerEvents();
}
