import { useEffect, useState } from 'preact/hooks';
import { useSoundSettings } from '../../audio/useSfx';
import { t } from '../strings';
import './menu.css';

export function GameMenu() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <div class="game-menu">
      <button
        type="button"
        class="status-button"
        aria-expanded={open}
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        {t('ui.menu')}
      </button>
      {open && <SoundItems />}
    </div>
  );
}

function SoundItems() {
  const { settings, setMuted, setVolume } = useSoundSettings();
  const onVolumeInput = (event: Event): void => {
    setVolume(Number((event.currentTarget as HTMLInputElement).value));
  };

  return (
    <div class="game-menu-list" role="menu">
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
    </div>
  );
}
