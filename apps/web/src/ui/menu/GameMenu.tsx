import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useSoundSettings } from '../../audio/useSfx';
import { t } from '../strings';
import './menu.css';

export interface MenuItem {
  id: string;
  label: string;
  onSelect: () => void;
  /** Draws a line above the item. */
  separated?: boolean;
  /** Entries shown under the item when it is clicked; the menu stays open. */
  children?: ComponentChildren;
}

export interface GameMenuProps {
  /** Status bar buttons that did not fit on the bar. */
  items?: readonly MenuItem[];
  onLogout?: () => void;
}

export function GameMenu({ items = [], onLogout }: GameMenuProps) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const choose = (action: () => void): void => {
    setOpen(false);
    action();
  };

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    const onPointerDown = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  const onListKeyDown = (event: KeyboardEvent): void => {
    const steps: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };
    const step = steps[event.key];
    const list = event.currentTarget as HTMLElement;
    if (step === undefined) {
      return;
    }
    event.preventDefault();
    const rows = [...list.querySelectorAll<HTMLElement>('button')];
    const current = rows.indexOf(document.activeElement as HTMLElement);
    rows[(current + step + rows.length) % rows.length]?.focus();
  };

  return (
    <div class="game-menu" ref={rootRef}>
      <button
        type="button"
        class="status-panel__logo"
        aria-label={t('ui.menu')}
        aria-expanded={open}
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <span>{t('ui.gameNameTop')}</span>
        <span>{t('ui.gameNameBottom')}</span>
      </button>
      {open && (
        <div class="game-menu-list" role="menu" onKeyDown={onListKeyDown}>
          <SoundItems />
          {items.map((item) => (
            <MenuEntry
              key={item.id}
              item={item}
              expanded={expanded === item.id}
              onToggle={() => setExpanded((current) => (current === item.id ? null : item.id))}
              onChoose={() => choose(item.onSelect)}
            />
          ))}
          {onLogout && (
            <button
              type="button"
              role="menuitem"
              class="is-separated"
              onClick={() => choose(onLogout)}
            >
              {t('ui.logout')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface MenuEntryProps {
  item: MenuItem;
  expanded: boolean;
  onToggle: () => void;
  onChoose: () => void;
}

function MenuEntry({ item, expanded, onToggle, onChoose }: MenuEntryProps) {
  if (item.children === undefined) {
    return (
      <button
        type="button"
        role="menuitem"
        class={item.separated ? 'is-separated' : undefined}
        onClick={onChoose}
      >
        {item.label}
      </button>
    );
  }
  return (
    <>
      <button
        type="button"
        role="menuitem"
        aria-haspopup="true"
        aria-expanded={expanded}
        class={item.separated ? 'is-separated' : undefined}
        onClick={onToggle}
      >
        {item.label} {expanded ? '▾' : '▸'}
      </button>
      {expanded && <div class="game-menu-children">{item.children}</div>}
    </>
  );
}

function SoundItems() {
  const { settings, setMuted, setVolume } = useSoundSettings();
  const onVolumeInput = (event: Event): void => {
    setVolume(Number((event.currentTarget as HTMLInputElement).value));
  };

  return (
    <>
      <button type="button" role="menuitem" onClick={() => setMuted(!settings.muted)}>
        {settings.muted ? t('ui.soundOff') : t('ui.soundOn')}
      </button>
      <label class="game-menu-volume">
        {t('ui.volume')}
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={settings.volume}
          disabled={settings.muted}
          onInput={onVolumeInput}
        />
        <span>{settings.volume}</span>
      </label>
    </>
  );
}
