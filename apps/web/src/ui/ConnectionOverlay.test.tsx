import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

  it('shows the banner while the socket retries', () => {
    render(<ConnectionOverlay status="retrying" />);
    expect(screen.getByRole('alert').textContent).toBe('Se perdió la conexión. Reintentando...');
  });

  it('shows nothing while live', () => {
    const { container } = render(<ConnectionOverlay status="live" />);
    expect(container.textContent).toBe('');
  });

  it('runs the banner across the whole width, under the top bar', () => {
    const css = readFileSync(resolve(__dirname, '../style.css'), 'utf8');
    const banner = /\.connection-banner \{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(banner).toContain('left: 0;');
  });
});
