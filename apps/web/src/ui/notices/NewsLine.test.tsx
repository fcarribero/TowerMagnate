import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { serverMessage, type NoticeView, type ServerMessage } from '@tower-magnate/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameConnection } from '../../net/gameConnection';
import { delta, snapshot } from '../../testing/protocolFixtures';
import { NewsLine } from './NewsLine';
import { NEWS_GRAY_AFTER_MS, NEWS_MIN_SHOWN_MS } from './noticeModel';
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

interface TickerProps {
  connection: GameConnection;
  onOpenAvisos?: () => void;
  onSeeUnit?: (unitId: string) => void;
}

function Ticker({ connection, onOpenAvisos = () => undefined, onSeeUnit }: TickerProps) {
  const notices = useNotices(connection, () => undefined);
  return (
    <NewsLine subscribe={notices.subscribeLine} onOpenAvisos={onOpenAvisos} onSeeUnit={onSeeUnit} />
  );
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

describe('NewsLine look and clicks', () => {
  it('shows the stamp apart from the text and the full text in the tooltip', () => {
    const { connection, receive } = fakeConnection();
    render(<Ticker connection={connection} />);
    receive(serverMessage('snapshot', snapshot));
    receive(serverMessage('delta', delta({ notices: noticesInOneDelta(1) })));

    expect(document.querySelector('.tm-news__stamp')?.textContent).toMatch(/\d{2}:\d{2}/);
    expect(shownText()).toBe('aviso 1');
    expect(screen.getByRole('tooltip', { hidden: true }).textContent).toBe('aviso 1');
    expect(document.querySelector('.tm-news__icon')).toBeNull();
  });

  it('keeps the stamp and mutes the line after 20 seconds without news', () => {
    const { connection, receive } = fakeConnection();
    render(<Ticker connection={connection} />);
    receive(serverMessage('snapshot', snapshot));
    receive(serverMessage('delta', delta({ notices: noticesInOneDelta(1) })));
    expect(document.querySelector('.tm-news.is-muted')).toBeNull();

    advance(NEWS_GRAY_AFTER_MS);
    expect(document.querySelector('.tm-news.is-muted')).not.toBeNull();
    expect(document.querySelector('.tm-news__stamp')).not.toBeNull();
  });

  it('opens Avisos on click and centers on the unit of the notice', () => {
    const { connection, receive } = fakeConnection();
    const onOpenAvisos = vi.fn();
    const onSeeUnit = vi.fn();
    render(<Ticker connection={connection} onOpenAvisos={onOpenAvisos} onSeeUnit={onSeeUnit} />);
    receive(serverMessage('snapshot', snapshot));
    receive(serverMessage('delta', delta({ notices: [{ ...notice(1), unitId: 'u7' }] })));

    fireEvent.click(screen.getByRole('button'));
    expect(onOpenAvisos).toHaveBeenCalledOnce();
    expect(onSeeUnit).toHaveBeenCalledWith('u7');
  });

  it('does not center when the notice has no unit', () => {
    const { connection, receive } = fakeConnection();
    const onSeeUnit = vi.fn();
    render(<Ticker connection={connection} onSeeUnit={onSeeUnit} />);
    receive(serverMessage('snapshot', snapshot));
    receive(serverMessage('delta', delta({ notices: noticesInOneDelta(1) })));

    fireEvent.click(screen.getByRole('button'));
    expect(onSeeUnit).not.toHaveBeenCalled();
  });
});
