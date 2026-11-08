import { describe, expect, it } from 'vitest';
import { noticeFromView } from './noticeModel';
import { noticeBody } from './noticeText';

describe('stars notice', () => {
  it('shows the star count the server sends', () => {
    const notice = noticeFromView({
      id: 'n1.0',
      step: 1,
      key: 'news.starsUp',
      unitId: null,
      params: { n: 3 },
    });
    expect(noticeBody(notice)).toBe('La torre llegó a 3 estrellas.');
  });
});
