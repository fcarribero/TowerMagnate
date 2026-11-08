import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { serverMessage, type NoticeView, type ServerMessage } from '@tower-magnate/shared';
import { STEPS_PER_HOUR, STEPS_PER_MINUTE } from '@tower-magnate/engine/calendar';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameConnection } from '../../net/gameConnection';
import { useFakeLayoutSizes } from '../../testing/fakeLayout';
import { delta, snapshot } from '../../testing/protocolFixtures';
import { WindowLayer } from '../kit/WindowLayer';
import { AvisosWindow } from './AvisosWindow';
import { AVISOS_KEPT, avisosFromSnapshot, type Notice } from './noticeModel';
import { useNotices } from './useNotices';

useFakeLayoutSizes({ clientWidth: 800, clientHeight: 600, offsetWidth: 360, offsetHeight: 200 });

afterEach(cleanup);

const MONDAY_08_15 = 8 * STEPS_PER_HOUR + 15 * STEPS_PER_MINUTE;

function notice(n: number, unitId: string | null = null): Notice {
  return { id: `n${n}`, step: MONDAY_08_15, key: `aviso ${n}`, params: {}, unitId, alert: false };
}

function view(n: number): NoticeView {
  return { id: `n${n}`, step: MONDAY_08_15, key: `aviso ${n}`, params: {}, unitId: null };
}

function renderAvisos(notices: readonly Notice[], onSeeUnit = vi.fn()) {
  render(
    <WindowLayer>
      <AvisosWindow notices={notices} onSeeUnit={onSeeUnit} onClose={() => undefined} />
    </WindowLayer>,
  );
  return onSeeUnit;
}

function rowTexts(): string[] {
  return [...document.querySelectorAll('.tm-avisos__item')].map((row) =>
    [...row.querySelectorAll('.tm-avisos__stamp, .tm-avisos__text')]
      .map((part) => part.textContent)
      .join('  '),
  );
}

describe('AvisosWindow', () => {
  it('is titled Avisos and writes each row as weekday, time and text', () => {
    renderAvisos([notice(1)]);
    expect(screen.getByText('Avisos')).toBeTruthy();
    expect(rowTexts()).toEqual(['Lun 08:15  aviso 1']);
  });

  it('shows a Ver button only on notices tied to a unit', () => {
    const onSeeUnit = renderAvisos([notice(2, 'unit-7'), notice(1)]);
    const buttons = screen.getAllByRole('button', { name: 'Ver' });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0] as HTMLElement);
    expect(onSeeUnit).toHaveBeenCalledWith('unit-7');
  });

  it('says there are no notices on a new tower', () => {
    renderAvisos([]);
    expect(screen.getByText('Todavía no hay avisos.')).toBeTruthy();
    expect(rowTexts()).toEqual([]);
  });
});

describe('avisosFromSnapshot', () => {
  it('keeps the newest 50 of 60, newest first', () => {
    const views = Array.from({ length: 60 }, (_, i) => view(i + 1));
    const avisos = avisosFromSnapshot(views);
    expect(avisos).toHaveLength(AVISOS_KEPT);
    expect(avisos[0]?.id).toBe('n60');
    expect(avisos.at(-1)?.id).toBe('n11');
  });
});

describe('Avisos fed by the server', () => {
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

  function LiveAvisos({ connection }: { connection: GameConnection }) {
    const notices = useNotices(connection, () => undefined);
    return (
      <WindowLayer>
        <AvisosWindow
          notices={notices.avisos}
          onSeeUnit={() => undefined}
          onClose={() => undefined}
        />
      </WindowLayer>
    );
  }

  it('shows only the latest 50 after 60 notices arrive', () => {
    const { connection, receive } = fakeConnection();
    render(<LiveAvisos connection={connection} />);
    receive(serverMessage('snapshot', { ...snapshot, notices: [] }));
    for (let n = 1; n <= 60; n += 1) {
      receive(serverMessage('delta', delta({ notices: [view(n)] })));
    }
    const rows = rowTexts();
    expect(rows).toHaveLength(AVISOS_KEPT);
    expect(rows[0]).toBe('Lun 08:15  aviso 60');
    expect(rows.at(-1)).toBe('Lun 08:15  aviso 11');
  });
});
