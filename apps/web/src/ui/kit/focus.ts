const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
}

/** Wraps Tab and Shift + Tab around the focusable elements of the container, and pulls focus back in from outside. */
export function trapTabKey(event: KeyboardEvent, container: HTMLElement): void {
  if (event.key !== 'Tab') {
    return;
  }
  const elements = focusableElements(container);
  const first = elements[0];
  const last = elements.at(-1);
  if (first === undefined || last === undefined) {
    event.preventDefault();
    return;
  }
  const active = document.activeElement;
  if (!(active instanceof Node) || !container.contains(active)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
    return;
  }
  const leavingBackwards = event.shiftKey && (active === first || active === container);
  const leavingForwards = !event.shiftKey && active === last;
  if (leavingBackwards) {
    event.preventDefault();
    last.focus();
  } else if (leavingForwards) {
    event.preventDefault();
    first.focus();
  }
}
