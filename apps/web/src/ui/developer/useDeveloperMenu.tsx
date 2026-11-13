import { useEffect, useState } from 'preact/hooks';
import type { MenuItem } from '../menu/GameMenu';
import { t } from '../strings';
import { DeveloperPanel } from './DeveloperPanel';
import { load, save, type DeveloperSettings } from './developerSettings';

/**
 * Developer settings kept in the browser and sent to the server whenever the connection goes
 * live, since the server forgets them when the tower is paused.
 */
export function useDeveloperMenu(
  developer: boolean,
  live: boolean,
  sendDebug: (type: string, payload: Record<string, unknown>) => boolean,
): { items: MenuItem[]; settings: DeveloperSettings } {
  const [settings, setSettings] = useState<DeveloperSettings>(load);

  useEffect(() => {
    if (!developer || !live) {
      return;
    }
    sendDebug('setInfiniteMoney', { enabled: settings.infiniteMoney });
    sendDebug('setSpeed', { speed: settings.speed });
  }, [developer, live, settings]);

  if (!developer) {
    return { items: [], settings };
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
  };
}
