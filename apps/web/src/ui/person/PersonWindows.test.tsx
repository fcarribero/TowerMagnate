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
import { ClientStore } from '../../model/clientStore';
import { InspectStore, type PersonInspect } from '../../model/inspectStore';
import { CommandClient } from '../../net/commandClient';
import type { GameConnection } from '../../net/gameConnection';
import { useFakeLayoutSizes } from '../../testing/fakeLayout';
import { snapshot } from '../../testing/protocolFixtures';
import { WindowLayer } from '../kit';
import { UnitWindows } from '../unit/UnitWindows';
import { FollowedWindow } from './FollowedWindow';
import { PersonWindows } from './PersonWindows';

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
    stressMinutes: 42,
    stress: 'stressed',
    homeUnitId: 'u1',
    ...patch,
  };
}

type Point = { x: number; y: number };

function setup(people: PersonView[] = [personView('p1')], followed: FollowedView[] = []) {
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
      <PersonWindows connection={connection} onCenter={onCenter} />
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
    expect(rows).toEqual([
      'TipoOficinista',
      'EstadoCaminando',
      'DestinoOficina · Piso 3',
      'Estrés42 min (alto)',
      'Trabaja enOficina · Piso 3',
    ]);
    expect(sent.at(-1)).toMatchObject({
      t: 'inspectAdd',
      p: { target: { kind: 'person', id: 'p1' } },
    });
  });

  it('colors the stress by level and keeps normal in ink', () => {
    const { open, show } = setup();
    open('p1');
    show(found('p1'));
    const stress = () => screen.getByText(/ min \(/);
    expect(stress().style.color).toBe('rgb(240, 122, 168)');
    show(found('p1', { stress: 'veryStressed', stressMinutes: 99 }));
    expect(stress().style.color).toBe('rgb(216, 30, 42)');
    show(found('p1', { stress: 'normal', stressMinutes: 3 }));
    expect(stress().style.color).toBe('');
  });

  it('shows the person name as title and renames on Enter and blur', () => {
    const { open, show, commandsSent } = setup();
    open('p1');
    show(found('p1'));
    const field = screen.getByLabelText('Nombre');
    fireEvent.input(field, { target: { value: 'Ana' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    fireEvent.input(field, { target: { value: 'Ana Paz' } });
    fireEvent.blur(field);
    show(found('p1', { name: 'Ana Paz' }));
    expect(screen.getByRole('dialog', { name: 'Ana Paz' })).toBeTruthy();
    expect(commandsSent()).toEqual([
      { type: 'renamePerson', personId: 'p1', name: 'Ana' },
      { type: 'renamePerson', personId: 'p1', name: 'Ana Paz' },
    ]);
  });

  it('limits the name field to 24 characters', () => {
    const { open, show } = setup();
    open('p1');
    show(found('p1'));
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).maxLength).toBe(24);
  });

  it('disables Seguir for an unnamed person', async () => {
    const { open, show, commandsSent } = setup();
    open('p1');
    show(found('p1'));
    const button = screen.getByRole('button', { name: 'Seguir' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.className).toContain('is-primary');
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

  it('shows the gone text and disables the controls for a removed person', () => {
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
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).disabled).toBe(true);
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

  it('reads the unit a person is inside from where the view shows them', () => {
    const { open, show } = setup([personView('p1', { mode: 'inside', x: 11 })]);
    open('p1');
    show(found('p1', { state: 'inside', destination: null }));
    expect(screen.getByText('En Oficina')).toBeTruthy();
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
