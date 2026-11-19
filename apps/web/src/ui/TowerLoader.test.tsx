import type { PlayResponse } from '@tower-magnate/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TowerApi } from '../api/towerApi';
import { TowerLoader } from './TowerLoader';

afterEach(cleanup);

const PLAY: PlayResponse = { token: 'tok', state: { step: 7 } };

function fakeApi(play: TowerApi['play']): TowerApi {
  return { resetTower: async () => true, play };
}

describe('TowerLoader', () => {
  it('shows loading then renders children with the play response', async () => {
    let answer: (play: PlayResponse | null) => void = () => {};
    const play = vi.fn(() => new Promise<PlayResponse | null>((resolve) => (answer = resolve)));
    render(
      <TowerLoader towerApi={fakeApi(play)} onSessionLost={() => {}}>
        {(response) => <p>token {response.token}</p>}
      </TowerLoader>,
    );
    expect(screen.getByText('Cargando la torre…')).toBeTruthy();
    answer(PLAY);
    expect(await screen.findByText('token tok')).toBeTruthy();
    expect(screen.queryByText('Cargando la torre…')).toBeNull();
    expect(play).toHaveBeenCalledOnce();
  });

  it('shows retry on failure and plays again on click', async () => {
    const play = vi.fn<TowerApi['play']>().mockResolvedValueOnce(null).mockResolvedValueOnce(PLAY);
    render(
      <TowerLoader towerApi={fakeApi(play)} onSessionLost={() => {}}>
        {(response) => <p>token {response.token}</p>}
      </TowerLoader>,
    );
    expect(await screen.findByText('No se pudo cargar la torre.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('token tok')).toBeTruthy();
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('play returning 401 calls onSessionLost', async () => {
    const onSessionLost = vi.fn();
    const play = vi.fn<TowerApi['play']>().mockResolvedValue('unauthenticated');
    render(
      <TowerLoader towerApi={fakeApi(play)} onSessionLost={onSessionLost}>
        {(response) => <p>token {response.token}</p>}
      </TowerLoader>,
    );
    await vi.waitFor(() => expect(onSessionLost).toHaveBeenCalledOnce());
    expect(screen.queryByText('No se pudo cargar la torre.')).toBeNull();
  });
});
