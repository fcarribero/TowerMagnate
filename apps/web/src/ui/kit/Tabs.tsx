import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';

export interface Tab {
  id: string;
  label: string;
  content: ComponentChildren;
}

export interface TabsProps {
  /** Prefix for element ids, unique on the page. */
  id: string;
  label: string;
  tabs: readonly Tab[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export function Tabs({ id, label, tabs, selectedId, onSelect }: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const selected = tabs.find((tab) => tab.id === selectedId) ?? tabs[0];

  const selectAndFocus = (index: number): void => {
    const tab = tabs[index];
    if (tab === undefined) {
      return;
    }
    onSelect(tab.id);
    listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const current = tabs.findIndex((tab) => tab.id === selected?.id);
    const last = tabs.length - 1;
    const targets: Record<string, number> = {
      ArrowRight: current === last ? 0 : current + 1,
      ArrowLeft: current === 0 ? last : current - 1,
      Home: 0,
      End: last,
    };
    const target = targets[event.key];
    if (target !== undefined) {
      event.preventDefault();
      selectAndFocus(target);
    }
  };

  return (
    <div class="tm-tabs">
      <div ref={listRef} class="tm-tabs__list" role="tablist" aria-label={label}>
        {tabs.map((tab) => {
          const isSelected = tab.id === selected?.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`${id}-tab-${tab.id}`}
              class={isSelected ? 'tm-tabs__tab is-selected' : 'tm-tabs__tab'}
              aria-selected={isSelected}
              aria-controls={`${id}-panel`}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => onSelect(tab.id)}
              onKeyDown={onKeyDown}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {selected !== undefined && (
        <div
          class="tm-tabs__panel"
          role="tabpanel"
          id={`${id}-panel`}
          aria-labelledby={`${id}-tab-${selected.id}`}
        >
          {selected.content}
        </div>
      )}
    </div>
  );
}
