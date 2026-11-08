import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectionOverlay } from './ConnectionOverlay';

afterEach(cleanup);

describe('ConnectionOverlay', () => {
  it('shows a centered box while connecting', () => {
    render(<ConnectionOverlay status="connecting" protocolMismatch={false} onReload={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toBe('Conectando...');
  });

  it('shows the banner while the socket retries', () => {
    render(<ConnectionOverlay status="retrying" protocolMismatch={false} onReload={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toBe('Se perdió la conexión. Reintentando...');
  });

  it('shows nothing while live', () => {
    const { container } = render(
      <ConnectionOverlay status="live" protocolMismatch={false} onReload={vi.fn()} />,
    );
    expect(container.textContent).toBe('');
  });

  it('asks for a reload on a protocol mismatch and reloads from the button', () => {
    const onReload = vi.fn();
    render(<ConnectionOverlay status="closed" protocolMismatch onReload={onReload} />);
    expect(screen.getByRole('alertdialog').textContent).toContain(
      'Hay una versión nueva del juego. Recargá la página.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Recargar' }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
