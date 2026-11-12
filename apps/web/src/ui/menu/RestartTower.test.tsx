import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SfxPlayer } from '../../audio/sfxPlayer';
import { SfxProvider } from '../../audio/useSfx';
import { FakeAudioContext } from '../../testing/fakeAudio';
import { useFakeLayoutSizes } from '../../testing/fakeLayout';
import { WindowLayer } from '../kit/WindowLayer';
import { t } from '../strings';
import { GameMenu } from './GameMenu';
import { RestartTowerDialogs, type RestartStep } from './RestartTowerDialogs';

useFakeLayoutSizes({ clientWidth: 800, clientHeight: 600, offsetWidth: 200, offsetHeight: 100 });

afterEach(cleanup);

function silentPlayer(): SfxPlayer {
  return new SfxPlayer({
    baseUrl: '/sfx/',
    format: 'mp3',
    fetchFile: () => Promise.resolve(new ArrayBuffer(8)),
    createAudioContext: () => new FakeAudioContext().asAudioContext(),
  });
}

function Harness({ restart, onLogout }: { restart: () => Promise<boolean>; onLogout: () => void }) {
  const [player] = useState(silentPlayer);
  const [step, setStep] = useState<RestartStep | null>(null);
  const onRestart = (): void => {
    setStep(null);
    void restart().then((restarted) => {
      if (!restarted) {
        setStep('failed');
      }
    });
  };
  return (
    <SfxProvider player={player} settingsStore={{ read: () => null, write: () => {} }}>
      <GameMenu
        items={[{ id: 'newTower', label: t('ui.newTower'), onSelect: () => setStep('first') }]}
        onLogout={onLogout}
      />
      <WindowLayer>
        <RestartTowerDialogs step={step} onStep={setStep} onRestart={onRestart} />
      </WindowLayer>
    </SfxProvider>
  );
}

function openRestartDialog(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Menú' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Empezar una torre nueva' }));
}

describe('account menu', () => {
  it('logs out from the menu', () => {
    const onLogout = vi.fn();
    render(<Harness restart={async () => true} onLogout={onLogout} />);
    fireEvent.click(screen.getByRole('button', { name: 'Menú' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cerrar sesión' }));
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it('restarts only after two confirmations', async () => {
    const restart = vi.fn(async () => true);
    render(<Harness restart={restart} onLogout={() => {}} />);
    openRestartDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Demoler y empezar' }));
    expect(restart).not.toHaveBeenCalled();
    expect(screen.getByText('¿Estás seguro?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, demoler todo' }));
    await waitFor(() => expect(restart).toHaveBeenCalledOnce());
    expect(screen.queryByText('¿Estás seguro?')).toBeNull();
  });

  it('dims the tower behind the confirmation and ignores clicks on the scrim', () => {
    const restart = vi.fn(async () => true);
    render(<Harness restart={restart} onLogout={() => {}} />);
    openRestartDialog();
    const scrim = document.querySelector('.tm-modal-backdrop') as HTMLElement;
    expect(scrim).not.toBeNull();
    fireEvent.click(scrim);
    expect(screen.getByText('Torre nueva')).toBeTruthy();
    expect(restart).not.toHaveBeenCalled();
  });

  it('keeps the tower when the first confirmation is cancelled', () => {
    const restart = vi.fn(async () => true);
    render(<Harness restart={restart} onLogout={() => {}} />);
    openRestartDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByText('Torre nueva')).toBeNull();
    expect(restart).not.toHaveBeenCalled();
  });

  it('keeps the tower when the second confirmation is cancelled', () => {
    const restart = vi.fn(async () => true);
    render(<Harness restart={restart} onLogout={() => {}} />);
    openRestartDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Demoler y empezar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByText('¿Estás seguro?')).toBeNull();
    expect(restart).not.toHaveBeenCalled();
  });

  it('says so when the server refuses', async () => {
    render(<Harness restart={async () => false} onLogout={() => {}} />);
    openRestartDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Demoler y empezar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, demoler todo' }));
    await waitFor(() => expect(screen.getByText(/Tu torre sigue como estaba/)).toBeTruthy());
  });
});
