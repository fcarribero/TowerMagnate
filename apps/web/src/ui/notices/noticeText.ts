import { hasString, t, type StringKey } from '../strings';
import { formatGameTime } from '../status/statusFormat';
import { dateOfStep } from '@tower-magnate/engine/calendar';
import type { Notice } from './noticeModel';

export function noticeStamp(step: number): string {
  const { weekday } = dateOfStep(step);
  return `${t(`calendar.weekdayShort.${weekday}` as StringKey)} ${formatGameTime(step)}`;
}

export function noticeBody(notice: Notice): string {
  return hasString(notice.key) ? t(notice.key, notice.params) : notice.key;
}

export function noticeLine(notice: Notice): string {
  return `${noticeStamp(notice.step)}  ${noticeBody(notice)}`;
}
