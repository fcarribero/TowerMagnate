export interface ListItem {
  id: string;
  label: string;
}

export interface ListBoxProps {
  id: string;
  label: string;
  items: readonly ListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Height in rows before the list scrolls. */
  rows?: number;
}

const ROW_HEIGHT_UI_PIXELS = 14;

/** A single-select list. Arrow keys, Home and End move the selection. */
export function ListBox({ id, label, items, selectedId, onSelect, rows = 6 }: ListBoxProps) {
  const selectedIndex = items.findIndex((item) => item.id === selectedId);
  const optionId = (itemId: string) => `${id}-option-${itemId}`;

  const onKeyDown = (event: KeyboardEvent): void => {
    if (items.length === 0) {
      return;
    }
    const last = items.length - 1;
    const targets: Record<string, number> = {
      ArrowDown: Math.min(selectedIndex + 1, last),
      ArrowUp: Math.max(selectedIndex - 1, 0),
      Home: 0,
      End: last,
    };
    const target = targets[event.key];
    const item = target === undefined ? undefined : items[target];
    if (item !== undefined) {
      event.preventDefault();
      onSelect(item.id);
      document.getElementById(optionId(item.id))?.scrollIntoView?.({ block: 'nearest' });
    }
  };

  return (
    <div class="tm-list">
      <span id={`${id}-label`} class="tm-list__label">
        {label}
      </span>
      <ul
        id={id}
        class="tm-list__items"
        role="listbox"
        tabIndex={0}
        aria-labelledby={`${id}-label`}
        aria-activedescendant={selectedId === null ? undefined : optionId(selectedId)}
        style={{ maxHeight: `calc(${rows * ROW_HEIGHT_UI_PIXELS} * var(--tm-px))` }}
        onKeyDown={onKeyDown}
      >
        {items.map((item) => {
          const isSelected = item.id === selectedId;
          return (
            <li
              key={item.id}
              id={optionId(item.id)}
              role="option"
              aria-selected={isSelected}
              class={isSelected ? 'tm-list__item is-selected' : 'tm-list__item'}
              onClick={() => onSelect(item.id)}
            >
              {item.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
