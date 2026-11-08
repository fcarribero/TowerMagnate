import { useEffect, useRef, useState } from 'preact/hooks';
import { NEWS_GRAY_AFTER_MS, NewsQueue, type Notice } from './noticeModel';
import { noticeLine } from './noticeText';
import './notices.css';

export interface NewsLineProps {
  subscribe: (listener: (notice: Notice) => void) => () => void;
  onOpenAvisos: () => void;
  /** Real clock in ms; tests pass their own. */
  now?: () => number;
}

/** The bottom line: one notice at a time, gray after 20 real seconds, alerts in red. */
export function NewsLine({ subscribe, onOpenAvisos, now = Date.now }: NewsLineProps) {
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
    return () => {
      stop();
      clearTimeout(timer);
    };
  }, [subscribe, now]);

  const current = queue.current.current();
  if (current === null) {
    return <div class="tm-news" />;
  }
  const classes = ['tm-news', current.alert && 'is-alert', queue.current.isGray(now()) && 'is-gray']
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" class={classes} onClick={onOpenAvisos}>
      {current.alert && <span class="tm-news__icon" aria-hidden="true" />}
      <span class="tm-news__text">{noticeLine(current)}</span>
    </button>
  );
}
