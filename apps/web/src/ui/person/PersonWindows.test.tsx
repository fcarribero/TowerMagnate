import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import type {
  ClientMessage,
  FollowedView,
  InspectData,
  PersonView,
  UnitView,
} from '@tower-magnate/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CameraListener } from '../../render/stage';
import { ClientStore } from '../../model/clientStore';
import { InspectStore, type PersonInspect } from '../../model/inspectStore';
import { CommandClient } from '../../net/commandClient';
import type { GameConnection } from '../../net/gameConnection';
import { useFakeLayoutSizes } from '../../testing/fakeLayout';
import { snapshot } from '../../testing/protocolFixtures';
import { WindowLayer } from '../kit';
import { UnitWindows } from '../unit/UnitWindows';
import { FollowedWindow } from './FollowedWindow';
import { PersonWindows, type PersonPanelStage } from './PersonWindows';

useFakeLayoutSizes({ clientWidth: 800, clientHeight: 600, offsetWidth: 150, offsetHeight: 100 });

afterEach(cleanup);

const office: UnitView = {
  id: 'u1',
  type: 'office',
  x: 10,
  level: 3,
  name: null,
  price: 'normal',
  occupied: true,
  variant: 'occupied',
};

function personView(id: string, patch: Partial<PersonView> = {}): PersonView {
  return {
    id,
    kind: 'officeWorker',
    x: 12,
    level: 3,
    facing: 'right',
    mode: 'walk',
    carRef: null,
    stress: 'normal',
    ...patch,
  };
}

function followedView(id: string, patch: Partial<FollowedView> = {}): FollowedView {
  return {
    id,
    name: `Persona ${id}`,
    kind: 'resident',
    level: 5,
    x: 40,
    stress: 'normal',
    ...patch,
  };
}

type Found = Extract<PersonInspect, { status: 'ok' }>;

function found(id: string, patch: Partial<Found> = {}): Found {
  return {
    kind: 'person',
    id,
    status: 'ok',
    name: null,
    personKind: 'officeWorker',
    state: 'walk',
    destination: { kind: 'unit', unitId: 'u1', level: 3 },
    stressScore: 4.2,
    stress: 'stressed',
    stressCauses: {
      wait: 30,
      ride: 6,
      stairs: 0,
      queue: 0,
      noRoute: 0,
      walk: 4,
      surroundings: 2,
      calm: 0,
    },
    homeUnitId: 'u1',
    ...patch,
  };
}

type Point = { x: number; y: number };

function fakePersonStage(
  rects: Record<string, { x: number; y: number; width: number; height: number }>,
) {
  const listeners = new Set<CameraListener>();
  const selected: (string | null)[] = [];
  return {
    rects,
    selected,
    personScreenRect: (id: string) => rects[id] ?? null,
    showPersonSelection: (id: string | null) => {
      selected.push(id);
    },
    cssPerDevicePixel: () => 1,
    onCameraChange: (listener: CameraListener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    pan: () => listeners.forEach((listener) => listener({} as Parameters<CameraListener>[0])),
  };
}

function setup(
  people: PersonView[] = [personView('p1')],
  followed: FollowedView[] = [],
  stage: PersonPanelStage | null = null,
) {
  const sent: ClientMessage[] = [];
  const store = new ClientStore({ requestResync: () => undefined, now: () => 0 });
  store.applySnapshot({ ...snapshot, units: [office], people, followed });
  const inspect = new InspectStore();
  const commands = new CommandClient({
    send: (message) => {
      sent.push(message);
      return true;
    },
  });
  const connection = { store, inspect, commands } as unknown as GameConnection;
  const centered: Point[] = [];
  const onCenter = (point: Point): void => {
    centered.push(point);
  };
  const view = render(
    <WindowLayer>
      <UnitWindows connection={connection} />
      <PersonWindows connection={connection} onCenter={onCenter} stage={stage} />
    </WindowLayer>,
  );
  const show = (data: InspectData): void => {
    act(() => inspect.receive({ v: 1, t: 'inspect', p: data }));
  };
  const open = (id: string): void => {
    act(() => inspect.requestPersonWindow(id));
  };
  const commandsSent = () =>
    sent.flatMap((message) => (message.t === 'command' ? [message.p.command] : []));
  return { store, connection, show, open, commandsSent, sent, centered, onCenter, view };
}

describe('person windows', () => {
  it('opens titled with the kind, rows in order, and inspects the person', () => {
    const { open, show, sent } = setup();
    open('p1');
    show(found('p1'));
    const dialog = screen.getByRole('dialog', { name: 'Oficinista' });
    const rows = [...dialog.querySelectorAll('.tm-person__row')].map((row) => row.textContent);
    // Type, state and destination are not shown in the panel; stress is a bar, not a row.
    expect(rows).toEqual(['Trabaja enOficina · Piso 3']);
    expect(sent.at(-1)).toMatchObject({
      t: 'inspectAdd',
      p: { target: { kind: 'person', id: 'p1' } },
    });
  });

  it('shows stress as a bar from 0 to 10 with the score in numbers', () => {
    const { open, show } = setup();
    open('p1');
    show(found('p1'));
    const meter = () => screen.getByRole('meter', { name: 'Estrés' });
    const fill = () => meter().querySelector('.tm-person__stress-fill') as HTMLElement;
    expect(meter().getAttribute('aria-valuemin')).toBe('0');
    expect(meter().getAttribute('aria-valuemax')).toBe('10');
    expect(meter().getAttribute('aria-valuenow')).toBe('4.2');
    expect(meter().getAttribute('aria-valuetext')).toBe('4,2 / 10');
    expect(screen.getByText('4,2 / 10')).toBeTruthy();
    expect(fill().style.width).toBe('42%');
    expect(screen.queryByText(/alto|min \(/)).toBeNull();
    expect(meter().querySelector('.tm-person__stress-mark')).toBeNull();
    show(found('p1', { stressScore: 10 }));
    expect(fill().style.background).toBe('rgb(216, 30, 42)');
  });

  it('lists what makes the person unhappy and what they are happy with', () => {
    const { open, show } = setup();
    open('p1');
    show(found('p1'));
    const unhappy = screen.getByText('Disconforme por').closest('section') as HTMLElement;
    const happy = screen.getByText('Contento con').closest('section') as HTMLElement;
    // Waits are 30 of 42 minutes, rides 6: both weigh on them; walking (4) is under 10%.
    expect([...unhappy.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'Esperas largas del ascensor',
      'Viajes largos en ascensor',
    ]);
    expect(within(happy).getByText('Casi no usa escaleras')).toBeTruthy();
  });

  it('renames from the pencil in the title: Aceptar and Enter send the name, an empty name clears it', () => {
    const { open, show, commandsSent } = setup();
    open('p1');
    show(found('p1'));
    expect(screen.queryByRole('textbox', { name: 'Nombre' })).toBeNull();
    const rename = (value: string, how: 'click' | 'enter'): void => {
      const pencil = screen.getByRole('button', { name: 'Cambiar nombre' });
      expect(pencil.closest('.tm-window__title')).toBeTruthy();
      fireEvent.click(pencil);
      const prompt = screen.getByRole('alertdialog', { name: 'Cambiar nombre' });
      const field = within(prompt).getByLabelText('Nombre');
      fireEvent.input(field, { target: { value } });
      if (how === 'enter') fireEvent.keyDown(field, { key: 'Enter' });
      else fireEvent.click(within(prompt).getByRole('button', { name: 'Aceptar' }));
      expect(screen.queryByRole('alertdialog', { name: 'Cambiar nombre' })).toBeNull();
    };
    rename('Ana', 'enter');
    show(found('p1', { name: 'Ana' }));
    expect(screen.getByRole('dialog', { name: 'Ana' })).toBeTruthy();
    rename('Ana Paz', 'click');
    show(found('p1', { name: 'Ana Paz' }));
    rename('', 'click');
    expect(commandsSent()).toEqual([
      { type: 'renamePerson', personId: 'p1', name: 'Ana' },
      { type: 'renamePerson', personId: 'p1', name: 'Ana Paz' },
      { type: 'renamePerson', personId: 'p1', name: '' },
    ]);
  });

  it('opens the rename window with the current name, limited to 24 characters, and sends nothing on no change', () => {
    const { open, show, commandsSent } = setup();
    open('p1');
    show(found('p1', { name: 'Ana' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar nombre' }));
    const prompt = screen.getByRole('alertdialog', { name: 'Cambiar nombre' });
    const field = within(prompt).getByLabelText('Nombre') as HTMLInputElement;
    expect(field.value).toBe('Ana');
    expect(field.maxLength).toBe(24);
    fireEvent.click(within(prompt).getByRole('button', { name: 'Aceptar' }));
    expect(commandsSent()).toEqual([]);
  });

  it('disables Seguir for an unnamed person', async () => {
    const { open, show, commandsSent } = setup();
    open('p1');
    show(found('p1'));
    const button = screen.getByRole('button', { name: 'Seguir' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await userEvent.click(button);
    expect(commandsSent()).toEqual([]);
  });

  it('shows the needs-name tooltip on hover', () => {
    vi.useFakeTimers();
    try {
      const { open, show } = setup();
      open('p1');
      show(found('p1'));
      const anchor = screen.getByRole('button', { name: 'Seguir' }).closest('.tm-tooltip-anchor');
      fireEvent.pointerEnter(anchor as HTMLElement);
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(screen.getByRole('tooltip').textContent).toBe(
        'Poné un nombre para seguir a esta persona.',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('follows a named person and unfollows a followed one', () => {
    const { open, show, commandsSent, store } = setup();
    open('p1');
    show(found('p1', { name: 'Ana' }));
    fireEvent.click(screen.getByRole('button', { name: 'Seguir' }));
    act(() =>
      store.applySnapshot({
        ...snapshot,
        units: [office],
        people: [personView('p1')],
        followed: [followedView('p1', { name: 'Ana' })],
      }),
    );
    const unfollow = screen.getByRole('button', { name: 'Dejar de seguir' });
    expect(unfollow.className).not.toContain('is-primary');
    fireEvent.click(unfollow);
    expect(commandsSent()).toEqual([
      { type: 'followPerson', personId: 'p1' },
      { type: 'unfollowPerson', personId: 'p1' },
    ]);
  });

  it('disables Seguir at 20 followed people', () => {
    const twenty = Array.from({ length: 20 }, (_, index) => followedView(`p${index + 100}`));
    const { open, show } = setup([personView('p1')], twenty);
    open('p1');
    show(found('p1', { name: 'Ana' }));
    expect((screen.getByRole('button', { name: 'Seguir' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('centers on the person keeping the zoom', () => {
    const { open, show, centered } = setup();
    open('p1');
    show(found('p1'));
    fireEvent.click(screen.getByRole('button', { name: 'Centrar' }));
    expect(centered).toHaveLength(1);
    expect(centered[0]?.x).toBe(12.5 * 8);
  });

  it('shows the gone text and disables the controls and hides the pencil for a removed person', () => {
    const { open, show } = setup();
    open('p1');
    show(found('p1', { name: 'Ana' }));
    show({ kind: 'person', id: 'p1', status: 'gone' });
    const dialog = screen.getByRole('dialog', { name: 'Ana' });
    expect(within(dialog).getByText('Ya no está en la torre.')).toBeTruthy();
    for (const name of ['Seguir', 'Centrar']) {
      expect((within(dialog).getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(
        true,
      );
    }
    expect(within(dialog).queryByRole('button', { name: 'Cambiar nombre' })).toBeNull();
  });

  it('closes the oldest of five person windows and stops inspecting it', () => {
    const { open, show, sent } = setup();
    for (const id of ['p1', 'p2', 'p3', 'p4', 'p5']) {
      open(id);
      show(found(id, { name: `Nombre ${id}` }));
    }
    expect(screen.queryByRole('dialog', { name: 'Nombre p1' })).toBeNull();
    expect(screen.getAllByRole('dialog')).toHaveLength(4);
    expect(sent.filter((message) => message.t === 'inspectRemove')).toHaveLength(1);
  });
});

describe('Personas seguidas', () => {
  function setupList(followed: FollowedView[]) {
    const base = setup([personView('p1')], followed);
    const centered: Point[] = [];
    const { connection, view } = base;
    view.rerender(
      <WindowLayer>
        <UnitWindows connection={connection} />
        <FollowedWindow
          connection={connection}
          onCenter={(point) => centered.push(point)}
          onClose={() => undefined}
        />
        <PersonWindows connection={connection} onCenter={() => undefined} />
      </WindowLayer>,
    );
    return { ...base, centered };
  }

  it('shows the empty text with 0 de 20', () => {
    setupList([]);
    const dialog = screen.getByRole('dialog', { name: 'Personas seguidas (0 de 20)' });
    expect(within(dialog).getByText(/^Todavía no seguís a nadie\./)).toBeTruthy();
  });

  it('keeps the 20 rows inside a scroll area of 160 UI pixels', () => {
    setupList(Array.from({ length: 20 }, (_, index) => followedView(`p${index + 100}`)));
    const dialog = screen.getByRole('dialog', { name: 'Personas seguidas (20 de 20)' });
    const scroll = within(dialog).getByRole('region');
    expect(scroll.querySelectorAll('.tm-followed__row')).toHaveLength(20);
    expect(scroll.style.maxHeight).toBe('calc(160 * var(--tm-px))');
  });

  it('lists name and kind with the stress square per row', () => {
    setupList([
      followedView('p7', { name: 'Ana', stress: 'veryStressed' }),
      followedView('p8', { name: 'Beto', kind: 'hotelGuest' }),
    ]);
    const dialog = screen.getByRole('dialog', { name: 'Personas seguidas (2 de 20)' });
    const rows = [...dialog.querySelectorAll('.tm-followed__row')];
    expect(rows.map((row) => row.textContent?.replace(/x$/, ''))).toEqual([
      'AnaResidente',
      'BetoHuésped',
    ]);
    const square = rows[0]?.querySelector<HTMLElement>('.tm-followed__stress');
    expect(square?.style.background).toBe('rgb(216, 30, 42)');
  });

  it('centers the view and opens the person window when a row is clicked', () => {
    const { centered, sent } = setupList([followedView('p7', { name: 'Ana' })]);
    fireEvent.click(screen.getByText('Ana'));
    expect(centered).toHaveLength(1);
    expect(sent.at(-1)).toMatchObject({
      t: 'inspectAdd',
      p: { target: { kind: 'person', id: 'p7' } },
    });
  });

  it('stops following from the x button without opening the person', () => {
    const { commandsSent, centered } = setupList([followedView('p7', { name: 'Ana' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Dejar de seguir' }));
    expect(commandsSent()).toEqual([{ type: 'unfollowPerson', personId: 'p7' }]);
    expect(centered).toEqual([]);
  });
});

describe('person panel', () => {
  const rect = { x: 100, y: 120, width: 10, height: 20 };

  it('opens next to the anchored person with a close button, and inspects them', () => {
    const stage = fakePersonStage({ p1: rect });
    const { connection, show, sent } = setup([personView('p1')], [], stage);
    act(() => connection.inspect.anchorPerson('p1'));
    show(found('p1'));
    const panel = screen.getByRole('dialog', { name: 'Oficinista' });
    expect(panel.querySelector('canvas.tm-unit__portrait')).not.toBeNull();
    expect(stage.selected.at(-1)).toBe('p1');
    expect(sent.at(-1)).toMatchObject({
      t: 'inspectAdd',
      p: { target: { kind: 'person', id: 'p1' } },
    });
  });

  it('closes the panel from its close button', () => {
    const stage = fakePersonStage({ p1: rect });
    const { connection, show } = setup([personView('p1')], [], stage);
    act(() => connection.inspect.anchorPerson('p1'));
    show(found('p1'));
    const panel = screen.getByRole('dialog', { name: 'Oficinista' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Cerrar' }));
    expect(connection.inspect.anchoredPerson()).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Oficinista' })).toBeNull();
  });

  it('hides the panel and the frame when the anchor is cleared', () => {
    const stage = fakePersonStage({ p1: rect });
    const { connection, show } = setup([personView('p1')], [], stage);
    act(() => connection.inspect.anchorPerson('p1'));
    show(found('p1'));
    act(() => connection.inspect.clearAnchor());
    expect(screen.queryByRole('dialog', { name: 'Oficinista' })).toBeNull();
    expect(stage.selected.at(-1)).toBeNull();
  });

  it('closes on a pointer press outside the panel but not on the canvas or inside it', () => {
    const stage = fakePersonStage({ p1: rect });
    const { connection, show } = setup([personView('p1')], [], stage);
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    act(() => connection.inspect.anchorPerson('p1'));
    show(found('p1'));
    const panel = screen.getByRole('dialog', { name: 'Oficinista' });
    fireEvent.pointerDown(panel);
    fireEvent.pointerDown(canvas);
    expect(connection.inspect.anchoredPerson()).toBe('p1');
    fireEvent.pointerDown(document.body);
    expect(connection.inspect.anchoredPerson()).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Oficinista' })).toBeNull();
    canvas.remove();
  });

  it('follows with a star and unfollows with the same star', () => {
    const stage = fakePersonStage({ p1: rect });
    const { connection, show, store, commandsSent } = setup([personView('p1')], [], stage);
    act(() => connection.inspect.anchorPerson('p1'));
    show(found('p1', { name: 'Ana' }));
    const star = screen.getByRole('button', { name: 'Seguir' });
    expect(star.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(star);
    act(() =>
      store.applySnapshot({
        ...snapshot,
        units: [office],
        people: [personView('p1')],
        followed: [followedView('p1', { name: 'Ana' })],
      }),
    );
    const active = screen.getByRole('button', { name: 'Dejar de seguir' });
    expect(active.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(active);
    expect(commandsSent()).toEqual([
      { type: 'followPerson', personId: 'p1' },
      { type: 'unfollowPerson', personId: 'p1' },
    ]);
  });

  it('asks for the panel when the person is on screen and for a window when they are not', () => {
    const stage = fakePersonStage({ p1: rect });
    const { connection, open, show } = setup([personView('p1'), personView('p2')], [], stage);
    open('p1');
    expect(connection.inspect.anchoredPerson()).toBe('p1');
    open('p2');
    show(found('p2'));
    expect(connection.inspect.anchoredPerson()).toBe('p1');
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
  });
});
