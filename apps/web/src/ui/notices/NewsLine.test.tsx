import { act, cleanup, render, screen } from '@testing-library/preact';
import { serverMessage, type NoticeView, type ServerMessage } from '@tower-magnate/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameConnection } from '../../net/gameConnection';
import { delta, snapshot } from '../../testing/protocolFixtures';
import { NewsLine } from './NewsLine';
import { NEWS_MIN_SHOWN_MS } from './noticeModel';
import { useNotices } from './useNotices';

function fakeConnection() {
  const listeners = new Set<(message: ServerMessage) => void>();
  const connection = {
    onMessage(listener: (message: ServerMessage) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as GameConnection;
  const receive = (message: ServerMessage): void => {
    act(() => {
      for (const listener of listeners) {
        listener(message);
      }
    });
  };
  return { connection, receive };
}

function Ticker({ connection }: { connection: GameConnection }) {
  const notices = useNotices(connection, () => undefined);
  return <NewsLine subscribe={notices.subscribeLine} onOpenAvisos={() => undefined} />;
}

function notice(n: number): NoticeView {
  return { id: `n${n}`, step: snapshot.step, key: `aviso ${n}`, params: {}, unitId: null };
}

function noticesInOneDelta(count: number): NoticeView[] {
  return Array.from({ length: count }, (_, i) => notice(i + 1));
}

function shownText(): string {
  return document.querySelector('.tm-news__text')?.textContent ?? '';
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('NewsLine with notices from the server', () => {
  it('moves through notices that arrive in one delta, one every few seconds', () => {
    const { connection, receive } = fakeConnection();
    render(<Ticker connection={connection} />);
    receive(serverMessage('snapshot', snapshot));

    receive(serverMessage('delta', delta({ notices: noticesInOneDelta(3) })));
    expect(shownText()).toContain('aviso 1');

    advance(NEWS_MIN_SHOWN_MS);
    expect(shownText()).toContain('aviso 2');

    advance(NEWS_MIN_SHOWN_MS);
    expect(shownText()).toContain('aviso 3');
  });

  it('jumps to the newest of six notices in one delta after the first had its time', () => {
    const { connection, receive } = fakeConnection();
    render(<Ticker connection={connection} />);
    receive(serverMessage('snapshot', snapshot));

    receive(serverMessage('delta', delta({ notices: noticesInOneDelta(6) })));
    expect(shownText()).toContain('aviso 1');

    advance(NEWS_MIN_SHOWN_MS);
    expect(shownText()).toContain('aviso 6');
    expect(screen.queryByText(/aviso 2/)).toBeNull();
  });
});
