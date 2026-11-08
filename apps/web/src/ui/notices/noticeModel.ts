import { NEWS_RULES, type NewsId, type NoticeView } from '@tower-magnate/shared';

export const AVISOS_KEPT = 50;
export const NEWS_MIN_SHOWN_MS = 4000;
export const NEWS_MAX_WAITING = 5;
export const NEWS_GRAY_AFTER_MS = 20000;

export interface Notice {
  id: string;
  step: number;
  key: string;
  params: Record<string, string | number>;
  unitId: string | null;
  alert: boolean;
}

export function isAlertKey(key: string): boolean {
  const rule = NEWS_RULES[key as NewsId] as { alert?: boolean } | undefined;
  return rule?.alert === true;
}

export function noticeFromView(view: NoticeView): Notice {
  return {
    id: view.id,
    step: view.step,
    key: view.key,
    params: view.params,
    unitId: view.unitId,
    alert: isAlertKey(view.key),
  };
}

/** Snapshot notices arrive oldest first; Avisos keeps the newest 50, newest first. */
export function avisosFromSnapshot(views: readonly NoticeView[]): Notice[] {
  return views.map(noticeFromView).reverse().slice(0, AVISOS_KEPT);
}

/** The last 50 notices, newest first. */
export function addToAvisos(list: readonly Notice[], notice: Notice): Notice[] {
  return [notice, ...list.filter((other) => other.id !== notice.id)].slice(0, AVISOS_KEPT);
}

/**
 * What the news line shows. Each notice stays at least NEWS_MIN_SHOWN_MS. When
 * more than NEWS_MAX_WAITING are waiting, the line jumps to the newest and the
 * skipped ones are only in Avisos. Time is passed in so tests need no timers.
 */
export class NewsQueue {
  private shown: Notice | null = null;
  private shownAt = 0;
  private waiting: Notice[] = [];

  push(notice: Notice, now: number): void {
    this.waiting.push(notice);
    const holding = this.shown !== null && now - this.shownAt < NEWS_MIN_SHOWN_MS ? 1 : 0;
    if (this.waiting.length + holding > NEWS_MAX_WAITING) {
      this.waiting = [notice];
    }
    this.tick(now);
  }

  /** Moves to the next notice once the current one had its time. */
  tick(now: number): void {
    const next = this.waiting[0];
    if (next !== undefined && (this.shown === null || now - this.shownAt >= NEWS_MIN_SHOWN_MS)) {
      this.shown = next;
      this.shownAt = now;
      this.waiting.shift();
    }
  }

  current(): Notice | null {
    return this.shown;
  }

  isGray(now: number): boolean {
    return this.shown !== null && now - this.shownAt >= NEWS_GRAY_AFTER_MS;
  }

  /** Real ms until the line may change, or null when nothing waits. */
  msToNext(now: number): number | null {
    if (this.waiting.length === 0) {
      return null;
    }
    return Math.max(0, NEWS_MIN_SHOWN_MS - (now - this.shownAt));
  }
}
