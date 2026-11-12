import type { ComponentChildren } from 'preact';

export interface ScrollAreaProps {
  label: string;
  children?: ComponentChildren;
  /** Height in UI pixels before the content scrolls. */
  maxHeight?: number;
}

/** A focusable region that scrolls vertically with the kit scroll bar. */
export function ScrollArea({ label, children, maxHeight }: ScrollAreaProps) {
  return (
    <div
      class="tm-scroll"
      role="region"
      tabIndex={0}
      aria-label={label}
      style={
        maxHeight === undefined ? undefined : { maxHeight: `calc(${maxHeight} * var(--tm-px))` }
      }
    >
      {children}
    </div>
  );
}
