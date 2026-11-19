import type { PlayResponse } from '@tower-magnate/shared';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerLike } from '../net/workerSocket';
import { useFakeLayoutSizes } from '../testing/fakeLayout';
import type { PageToWorker, WorkerToPage } from '../worker/workerMessages';
import { App } from './App';

// The tower view needs WebGL and art files, which jsdom lacks; it stays loading.
vi.mock('../render/stage', () => ({ mountStage: () => new Promise(() => {}) }));

useFakeLayoutSizes({ clientWidth: 800, clientHeight: 600, offsetWidth: 200, offsetHeight: 100 });

class FakeWorker implements WorkerLike {
  posted: PageToWorker[] = [];
  terminated = false;
  onmessage: ((event: MessageEvent<WorkerToPage>) => void) | null = null;

  postMessage(message: PageToWorker): void {
    this.posted.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(message: WorkerToPage): void {
    act(() => this.onmessage?.({ data: message } as MessageEvent<WorkerToPage>));
  }
}

const PLAY: PlayResponse = { token: 'tok', state: {} };

describe('App and the tower worker', () => {
  let worker: FakeWorker;

  beforeEach(() => {
    worker = new FakeWorker();
  });

  afterEach(cleanup);

  function renderApp(props: { onRestartTower?: () => Promise<boolean>; onPlayHere?: () => void }) {
    return render(
      <App
        play={PLAY}
        onPlayHere={props.onPlayHere ?? (() => {})}
        onLogout={() => {}}
        onRestartTower={props.onRestartTower ?? (async () => true)}
        createWorker={() => worker}
      />,
    );
  }

  it('restart stops the worker before resetting', async () => {
    let stoppedFirst: boolean | null = null;
    const onRestartTower = vi.fn(async () => {
      stoppedFirst = worker.terminated && worker.posted.at(-1)?.kind === 'stop';
      return true;
    });
    renderApp({ onRestartTower });
    fireEvent.click(screen.getByRole('button', { name: 'Menú' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Empezar una torre nueva' }));
    fireEvent.click(screen.getByRole('button', { name: 'Demoler y empezar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, demoler todo' }));
    await waitFor(() => expect(onRestartTower).toHaveBeenCalledOnce());
    expect(stoppedFirst).toBe(true);
  });

  it('takeover shows the blocker and Jugar acá calls onPlayHere', () => {
    const onPlayHere = vi.fn();
    renderApp({ onPlayHere });
    expect(screen.queryByText('La torre se abrió en otra ventana.')).toBeNull();
    worker.emit({ kind: 'takenOver' });
    expect(screen.getByText('La torre se abrió en otra ventana.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Jugar acá' }));
    expect(onPlayHere).toHaveBeenCalledOnce();
  });

  it('save failing shows the status bar warning', () => {
    renderApp({});
    expect(screen.queryByText('No se pudo guardar la partida')).toBeNull();
    worker.emit({ kind: 'saveFailing', failing: true });
    expect(screen.getByText('No se pudo guardar la partida')).toBeTruthy();
    worker.emit({ kind: 'saveFailing', failing: false });
    expect(screen.queryByText('No se pudo guardar la partida')).toBeNull();
  });
});
