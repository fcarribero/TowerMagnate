import type { NoticeView } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { noticeFromView } from './noticeModel';
import { noticeBody } from './noticeText';

function view(key: string, params: NoticeView['params']): NoticeView {
  return { id: 'n1.0', step: 1, key, unitId: null, params };
}

describe('noticeBody', () => {
  it('fills the level of a bomb blast', () => {
    const notice = noticeFromView(view('news.bombExploded', { level: '7' }));
    expect(noticeBody(notice)).toBe('Explotó la bomba en el piso 7.');
  });

  it('fills the basement and the amount of a treasure', () => {
    const notice = noticeFromView(view('news.treasure', { level: 'S3', amount: '$50.000' }));
    expect(noticeBody(notice)).toBe('¡Apareció un tesoro en el S3! Ganaste $50.000.');
  });

  it('fills the level of a fire and of cockroaches', () => {
    expect(noticeBody(noticeFromView(view('news.fire', { level: '12' })))).toBe(
      'Incendio en el piso 12.',
    );
    expect(noticeBody(noticeFromView(view('news.cockroaches', { level: '4' })))).not.toContain('{');
  });
});
