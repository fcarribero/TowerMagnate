import { useEffect } from 'preact/hooks';
import { Button } from '../kit/Button';
import { Window } from '../kit/Window';
import { useWindowManager } from '../kit/WindowLayer';
import { t } from '../strings';
import type { Notice } from './noticeModel';
import { noticeBody, noticeStamp } from './noticeText';
import './notices.css';

export const AVISOS_WINDOW_ID = 'avisos';

export interface AvisosWindowProps {
  notices: readonly Notice[];
  onSeeUnit: (unitId: string) => void;
  onClose: () => void;
}

/** The last 50 notices, newest first. */
export function AvisosWindow({ notices, onSeeUnit, onClose }: AvisosWindowProps) {
  const manager = useWindowManager();
  useEffect(() => {
    manager.open({ id: AVISOS_WINDOW_ID });
    return () => manager.close(AVISOS_WINDOW_ID);
  }, []);
  return (
    <Window id={AVISOS_WINDOW_ID} title={t('window.notices.title')} onClose={onClose} width={360}>
      {notices.length === 0 && <p class="tm-avisos__empty">{t('window.notices.empty')}</p>}
      <ul class="tm-avisos">
        {notices.map((notice) => (
          <li key={notice.id} class={notice.alert ? 'tm-avisos__item is-alert' : 'tm-avisos__item'}>
            <span class="tm-avisos__stamp">{noticeStamp(notice.step)}</span>
            <span class="tm-avisos__text">{noticeBody(notice)}</span>
            {notice.unitId !== null && (
              <Button onClick={() => onSeeUnit(notice.unitId as string)}>{t('ui.see')}</Button>
            )}
          </li>
        ))}
      </ul>
    </Window>
  );
}
