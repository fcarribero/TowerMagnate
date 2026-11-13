import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mountStage = vi.fn();
vi.mock('../render/stage', () => ({ mountStage: (...args: unknown[]) => mountStage(...args) }));

import { StageHost } from './StageHost';

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
});

describe('page stylesheet', () => {
  const css = readFileSync(resolve(import.meta.dirname, '../style.css'), 'utf8');

  it('has no literal color', () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });

  it('takes every font family from the tokens', () => {
    expect(css).not.toMatch(/font-family:\s*(?!\s|var\()/);
  });
});
