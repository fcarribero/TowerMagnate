import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { useEffect } from 'preact/hooks';
import { TextField } from './TextField';
import { Window } from './Window';
import { WindowLayer, useWindowManager } from './WindowLayer';
import type { OpenRequest } from './windowStack';

const VIEW = { width: 800, height: 600 };
const WINDOW_WIDTH = 200;

const sizeProperties = ['clientWidth', 'clientHeight', 'offsetWidth', 'offsetHeight'] as const;
const originals = new Map<string, PropertyDescriptor | undefined>();

beforeAll(() => {
  const sizes = {
    clientWidth: VIEW.width,
    clientHeight: VIEW.height,
    offsetWidth: WINDOW_WIDTH,
    offsetHeight: 100,
  };
  for (const property of sizeProperties) {
    originals.set(property, Object.getOwnPropertyDescriptor(HTMLElement.prototype, property));
    Object.defineProperty(HTMLElement.prototype, property, {
      configurable: true,
      get: () => sizes[property],
    });
  }
});

afterAll(() => {
  for (const property of sizeProperties) {
    const original = originals.get(property);
    if (original === undefined) {
      Reflect.deleteProperty(HTMLElement.prototype, property);
    } else {
      Object.defineProperty(HTMLElement.prototype, property, original);
    }
  }
});

afterEach(cleanup);

function Opener({ requests }: { requests: OpenRequest[] }) {
  const manager = useWindowManager();
  useEffect(() => {
    for (const request of requests) {
      manager.open(request);
    }
  }, []);
  return null;
}

function renderWindows(
  requests: OpenRequest[],
  options: { closable?: boolean; withField?: boolean } = {},
) {
  return render(
    <WindowLayer>
      <Opener requests={requests} />
      {requests.map((request) => (
        <Window
          key={request.id}
          id={request.id}
          title={`Ventana ${request.id}`}
          closable={options.closable}
        >
          {options.withField && (
            <TextField id={`field-${request.id}`} label="Nombre" value="" onChange={() => {}} />
          )}
        </Window>
      ))}
    </WindowLayer>,
  );
}

const at = (x: number, y: number) => ({ position: { x, y } });

function frameOf(id: string): HTMLElement {
  return screen.getByRole('dialog', { name: `Ventana ${id}` });
}

function isFront(id: string): boolean {
  return frameOf(id).classList.contains('is-active');
}

describe('Window', () => {
  it('shows the title and closes with the close button', () => {
    renderWindows([{ id: 'a', ...at(10, 10) }]);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('brings a clicked window to the front', () => {
    renderWindows([
      { id: 'a', ...at(10, 10) },
      { id: 'b', ...at(40, 40) },
    ]);
    expect(isFront('b')).toBe(true);
    fireEvent.pointerDown(frameOf('a'));
    expect(isFront('a')).toBe(true);
    expect(Number(frameOf('a').style.zIndex)).toBeGreaterThan(Number(frameOf('b').style.zIndex));
  });

  it('brings a window to the front when focus moves into it', () => {
    renderWindows(
      [
        { id: 'a', ...at(10, 10) },
        { id: 'b', ...at(40, 40) },
      ],
      { withField: true },
    );
    act(() => screen.getAllByLabelText('Nombre')[0]?.focus());
    expect(isFront('a')).toBe(true);
  });

  it('closes only the front window with Esc', () => {
    renderWindows([
      { id: 'a', ...at(10, 10) },
      { id: 'b', ...at(40, 40) },
    ]);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Ventana b' })).toBeNull();
    expect(frameOf('a')).toBeTruthy();
  });

  it('keeps a window without close button open on Esc', () => {
    renderWindows([{ id: 'a', ...at(10, 10) }], { closable: false });
    expect(screen.queryByRole('button', { name: 'Cerrar' })).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(frameOf('a')).toBeTruthy();
  });

  it('ignores Esc while a text field has focus', () => {
    renderWindows([{ id: 'a', ...at(10, 10) }], { withField: true });
    const field = screen.getByLabelText('Nombre');
    act(() => field.focus());
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(frameOf('a')).toBeTruthy();
  });

  it('drags by the title bar', () => {
    renderWindows([{ id: 'a', ...at(10, 10) }]);
    const title = screen.getByText('Ventana a');
    fireEvent.pointerDown(title, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(title, { pointerId: 1, clientX: 150, clientY: 130 });
    fireEvent.pointerUp(title, { pointerId: 1 });
    expect(frameOf('a').style.left).toBe('60px');
    expect(frameOf('a').style.top).toBe('40px');
  });

  it('keeps part of the title bar inside the view while dragging', () => {
    renderWindows([{ id: 'a', ...at(10, 10) }]);
    const title = screen.getByText('Ventana a');
    fireEvent.pointerDown(title, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(title, { pointerId: 1, clientX: 5000, clientY: -5000 });
    expect(frameOf('a').style.left).toBe(`${VIEW.width - 24}px`);
    expect(frameOf('a').style.top).toBe('0px');
  });

  it('cancels a drag with Esc and leaves the window open', () => {
    renderWindows([{ id: 'a', ...at(10, 10) }]);
    const title = screen.getByText('Ventana a');
    fireEvent.pointerDown(title, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(title, { pointerId: 1, clientX: 200, clientY: 200 });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(frameOf('a').style.left).toBe('10px');
    expect(frameOf('a').style.top).toBe('10px');
  });

  it('moves a window back inside when it starts outside the view', () => {
    renderWindows([{ id: 'a', ...at(2000, 2000) }]);
    expect(frameOf('a').style.left).toBe(`${VIEW.width - 24}px`);
    expect(frameOf('a').style.top).toBe(`${VIEW.height - 12}px`);
  });
});
