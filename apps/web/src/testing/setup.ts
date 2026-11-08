import { options } from 'preact';

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

// Preact flushes effects after the next frame and keeps a 100 ms fallback timer. A test file that
// ends inside that window gets the timer in a torn-down environment and fails the whole run.
options.requestAnimationFrame = (flush) => {
  queueMicrotask(flush);
};
