import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { ConnectionOverlay } from './ConnectionOverlay';

afterEach(cleanup);

describe('ConnectionOverlay', () => {
  it('shows a centered box while connecting', () => {
    render(<ConnectionOverlay status="connecting" />);
    const box = screen.getByRole('status');
    expect(box.textContent).toBe('Conectando...');
    expect(box.className).toBe('connection-box');
  });

  it('shows nothing while live', () => {
    const { container } = render(<ConnectionOverlay status="live" />);
    expect(container.textContent).toBe('');
  });
});
