import { useEffect, useState } from 'preact/hooks';
import { setAnimationPaused } from '../../render/animationClock';
import type { MenuItem } from '../menu/GameMenu';
import { isPlainShortcut } from '../keys';
import { t } from '../strings';
import { DeveloperPanel } from './DeveloperPanel';
import { load, save, speedForKey, type DeveloperSettings } from './developerSettings';
import type { SpeedControlsProps } from './SpeedControls';

/**
 * Developer settings kept in the browser and sent to the server whenever the connection goes
 * live, since the server forgets them when the tower is paused. The pause is not kept: a tower
 * opened again runs at the speed that was picked.
 */
export function useDeveloperMenu(
  developer: boolean,
  live: boolean,
  sendDebug: (type: string, payload: Record<string, unknown>) => boolean,
): { items: MenuItem[]; settings: DeveloperSettings; speedControls: SpeedControlsProps | null } {
  const [settings, setSettings] = useState<DeveloperSettings>(load);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!developer || !live) {
      return;
    }
    sendDebug('setInfiniteMoney', { enabled: settings.infiniteMoney });
    sendDebug('setSpeed', { speed: paused ? 0 : settings.speed });
  }, [developer, live, settings, paused]);

  useEffect(() => {
    setAnimationPaused(developer && paused);
    return () => setAnimationPaused(false);
  }, [developer, paused]);

  const pickSpeed = (speed: number): void => {
    const next = { ...settings, speed };
    save(next);
    setSettings(next);
    setPaused(false);
  };
  const togglePause = (): void => setPaused((was) => !was);

  useEffect(() => {
    if (!developer) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!isPlainShortcut(event) || event.shiftKey) {
        return;
      }
      if (event.key === ' ') {
        event.preventDefault();
        togglePause();
        return;
      }
      const speed = speedForKey(event.key);
      if (speed !== null) {
        pickSpeed(speed);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [developer, settings]);

  if (!developer) {
    return { items: [], settings, speedControls: null };
  }
  const change = (next: DeveloperSettings): void => {
    save(next);
    setSettings(next);
  };
  return {
    items: [
      {
        id: 'debug',
        label: t('ui.dev.debug'),
        separated: true,
        onSelect: () => undefined,
        children: <DeveloperPanel settings={settings} onChange={change} />,
      },
    ],
    settings,
    speedControls: { speed: settings.speed, paused, onPick: pickSpeed, onTogglePause: togglePause },
  };
}
