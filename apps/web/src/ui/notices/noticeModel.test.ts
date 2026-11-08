import { describe, expect, it } from 'vitest';
import { AVISOS_KEPT, NewsQueue, addToAvisos, type Notice } from './noticeModel';

function notice(n: number, alert = false): Notice {
  return { id: `n${n}`, step: n, key: 'news.santa', params: {}, unitId: null, alert };
}

describe('addToAvisos', () => {
  it('keeps 50 and drops the 51st, newest first', () => {
    let list: Notice[] = [];
    for (let n = 1; n <= AVISOS_KEPT + 1; n += 1) {
      list = addToAvisos(list, notice(n));
    }
    expect(list).toHaveLength(AVISOS_KEPT);
    expect(list[0]?.id).toBe('n51');
    expect(list.at(-1)?.id).toBe('n2');
  });
});

describe('NewsQueue', () => {
  it('shows the first notice at once and holds the next for 4 seconds', () => {
    const queue = new NewsQueue();
    queue.push(notice(1), 0);
    queue.push(notice(2), 1000);
    expect(queue.current()?.id).toBe('n1');
    queue.tick(3999);
    expect(queue.current()?.id).toBe('n1');
    queue.tick(4000);
    expect(queue.current()?.id).toBe('n2');
  });

  it('jumps to the newest when 6 notices arrive quickly', () => {
    const queue = new NewsQueue();
    for (let n = 1; n <= 6; n += 1) {
      queue.push(notice(n), n);
    }
    queue.tick(4001);
    expect(queue.current()?.id).toBe('n6');
    queue.tick(9000);
    expect(queue.current()?.id).toBe('n6');
  });

  it('draws the last notice gray after 20 seconds', () => {
    const queue = new NewsQueue();
    queue.push(notice(1), 0);
    expect(queue.isGray(19999)).toBe(false);
    expect(queue.isGray(20000)).toBe(true);
  });
});
