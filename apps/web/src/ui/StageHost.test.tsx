import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RenderStats } from '../render/stage';

const mountStage = vi.fn();
vi.mock('../render/stage', () => ({ mountStage: (...args: unknown[]) => mountStage(...args) }));

import { StageHost } from './StageHost';

const STATS: RenderStats = { fps: 60, zoom: 2, floorsDrawn: 14 } as RenderStats;

function mountWithStats() {
  mountStage.mockImplementation(
    (_host: unknown, options: { onStats: (s: RenderStats) => void }) => {
      options.onStats(STATS);
      return Promise.resolve({ destroy: vi.fn() });
    },
  );
}

afterEach(() => {
  cleanup();
  mountStage.mockReset();
  vi.unstubAllEnvs();
});

describe('StageHost', () => {
  it('shows the loading text from the string table, then clears it', async () => {
    mountStage.mockReturnValue(Promise.resolve({ destroy: vi.fn() }));
    render(<StageHost />);
    expect(screen.getByText('Cargando gráficos…')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Cargando gráficos…')).toBeNull());
  });

  it('shows the load error text when the renderer fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mountStage.mockReturnValue(Promise.reject(new Error('no graphics')));
    render(<StageHost />);
    expect(
      await screen.findByText('No se pudieron cargar los gráficos. Recargá la página.'),
    ).toBeTruthy();
  });

  it('shows the render stats line in development', async () => {
    vi.stubEnv('DEV', true);
    mountWithStats();
    render(<StageHost />);
    expect(await screen.findByText('60 FPS · Zoom 2x · Pisos dibujados: 14')).toBeTruthy();
  });

  it('hides the render stats line in production', async () => {
    vi.stubEnv('DEV', false);
    mountWithStats();
    render(<StageHost />);
    await waitFor(() => expect(screen.queryByText('Cargando gráficos…')).toBeNull());
    expect(screen.queryByText(/FPS/)).toBeNull();
  });
});
