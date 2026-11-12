import { useEffect, useRef, useState } from 'preact/hooks';
import { NEWS_GRAY_AFTER_MS, NewsQueue, type Notice } from './noticeModel';
import { noticeBody, noticeStamp } from './noticeText';
import { Tooltip } from '../kit';
import { ALARM_ICON, PixelIcon } from '../status/pixelIcons';
import './notices.css';

export interface NewsLineProps {
  subscribe: (listener: (notice: Notice) => void) => () => void;
  onOpenAvisos: () => void;
  /** Called on click for a notice tied to a unit. */
  onSeeUnit?: (unitId: string) => void;
  /** Real clock in ms; tests pass their own. */
  now?: () => number;
}

/** The bottom line: one notice at a time, muted after 20 real seconds, alerts in red. */
export function NewsLine({ subscribe, onOpenAvisos, onSeeUnit, now = Date.now }: NewsLineProps) {
  const queue = useRef(new NewsQueue());
  const [, redraw] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = (): void => {
      clearTimeout(timer);
      const at = now();
      queue.current.tick(at);
      redraw((n) => n + 1);
      const wait = queue.current.msToNext(at);
      if (wait !== null) {
        timer = setTimeout(refresh, wait);
      } else if (queue.current.current() !== null && !queue.current.isGray(at)) {
        timer = setTimeout(refresh, NEWS_GRAY_AFTER_MS);
      }
    };
    const stop = subscribe((notice) => {
      queue.current.push(notice, now());
      refresh();
    });
    refresh();
    return () => {
      stop();
      clearTimeout(timer);
    };
  }, [subscribe, now]);

  const current = queue.current.current();
  if (current === null) {
    return <div class="tm-news" />;
  }
  const classes = [
    'tm-news',
    current.alert && 'is-alert',
    queue.current.isGray(now()) && 'is-muted',
  ]
    .filter(Boolean)
    .join(' ');
  const open = (): void => {
    onOpenAvisos();
    if (current.unitId !== null) {
      onSeeUnit?.(current.unitId);
    }
  };
  return (
    <div class={classes}>
      <Tooltip text={noticeBody(current)}>
        <button type="button" class="tm-news__button" onClick={open}>
          <span key={current.id} class="tm-news__notice">
            {current.alert && <PixelIcon class="tm-news__icon" pattern={ALARM_ICON} />}
            <span class="tm-news__stamp">{noticeStamp(current.step)}</span>
            <span class="tm-news__text">{noticeBody(current)}</span>
          </span>
        </button>
      </Tooltip>
    </div>
  );
}
