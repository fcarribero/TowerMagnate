import type { PlayResponse } from '@tower-magnate/shared';
import type { VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { TowerApi } from '../api/towerApi';
import { Button } from './kit';
import { t } from './strings';

export interface TowerLoaderProps {
  towerApi: TowerApi;
  /** The server no longer accepts the session: back to login. */
  onSessionLost: () => void;
  children: (play: PlayResponse) => VNode;
}

type Load = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; play: PlayResponse };

/** Starts a play session on mount and shows the game once the saved tower arrived. */
export function TowerLoader({ towerApi, onSessionLost, children }: TowerLoaderProps) {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const mounted = useRef(true);

  const play = (): void => {
    setLoad({ status: 'loading' });
    void towerApi.play().then((response) => {
      if (!mounted.current) {
        return;
      }
      if (response === 'unauthenticated') {
        onSessionLost();
      } else {
        setLoad(response === null ? { status: 'failed' } : { status: 'ready', play: response });
      }
    });
  };

  useEffect(() => {
    mounted.current = true;
    play();
    return () => {
      mounted.current = false;
    };
    // Plays once per mount; Root remounts with a new key to play again.
  }, []);

  if (load.status === 'ready') {
    return children(load.play);
  }
  if (load.status === 'failed') {
    return (
      <div class="connection-blocker">
        <div class="connection-dialog" role="alertdialog" aria-describedby="tower-load-failed">
          <p id="tower-load-failed">{t('game.loadFailed')}</p>
          <div class="connection-dialog__buttons">
            <Button isDefault onClick={play}>
              {t('game.retry')}
            </Button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div class="connection-box" role="status">
      {t('game.loading')}
    </div>
  );
}
