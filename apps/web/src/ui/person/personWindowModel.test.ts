import type { UnitView } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import {
  destinationText,
  followStar,
  followedTitle,
  homeRow,
  kindName,
  personTitle,
  stateText,
  stressBar,
  stressColor,
  stressReasons,
} from './personWindowModel';

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
const named: UnitView = { ...office, id: 'u2', name: 'Estudio', level: -2 };
const units = new Map([office, named].map((unit) => [unit.id, unit]));
const unitOf = (id: string) => units.get(id);

describe('person window text', () => {
  it('titles the window with the name, or the kind when unnamed', () => {
    expect(personTitle('officeWorker', 'Ana')).toBe('Ana');
    expect(personTitle('officeWorker', null)).toBe('Oficinista');
    expect(kindName('police')).toBe('Seguridad');
    expect(kindName('courier')).toBe('Mensajero');
    expect(kindName('child')).toBe('Niño');
    expect(personTitle('courier', null)).toBe('Mensajero');
  });

  it('uses the tower palette for stress colors', () => {
    expect(stressColor('stressed')).toBe('#f07aa8');
    expect(stressColor('veryStressed')).toBe('#d81e2a');
  });

  it('names what the person is doing', () => {
    expect(stateText('walk', undefined)).toBe('Caminando');
    expect(stateText('walk', undefined, 'child')).toBe('Con un adulto');
    expect(stateText('ride', undefined, 'child')).toBe('Con un adulto');
    expect(stateText('outside', undefined, 'child')).toBe('Fuera de la torre');
    expect(stateText('wait', undefined)).toBe('Esperando el ascensor');
    expect(stateText('ride', undefined)).toBe('En el ascensor');
    expect(stateText('stairs', undefined)).toBe('En la escalera');
    expect(stateText('noRoute', undefined)).toBe('Sin ruta');
    expect(stateText('outside', undefined)).toBe('Fuera de la torre');
    expect(stateText('inside', named)).toBe('En Estudio');
    expect(stateText('inside', office)).toBe('En Oficina');
    expect(stateText('walk', undefined, 'courier')).toBe('Entregando un paquete');
    expect(stateText('inside', office, 'courier')).toBe('Entregando un paquete');
    expect(stateText('ride', undefined, 'courier')).toBe('En el ascensor');
    expect(stateText('walk', undefined, 'resident')).toBe('Caminando');
  });

  it('writes the destination as unit and level, exit or none', () => {
    expect(destinationText({ kind: 'unit', unitId: 'u1', level: 3 }, unitOf)).toBe(
      'Oficina · Piso 3',
    );
    expect(destinationText({ kind: 'unit', unitId: 'u2', level: -2 }, unitOf)).toBe('Estudio · S2');
    expect(destinationText({ kind: 'exit' }, unitOf)).toBe('Sale de la torre');
    expect(destinationText(null, unitOf)).toBe('Ninguno');
  });

  it('shows the home row that fits the kind and hides it for the others', () => {
    expect(homeRow('resident', 'u2', unitOf)).toEqual({ label: 'Vive en', value: 'Estudio · S2' });
    expect(homeRow('officeWorker', 'u1', unitOf)).toEqual({
      label: 'Trabaja en',
      value: 'Oficina · Piso 3',
    });
    expect(homeRow('hotelGuest', 'u1', unitOf)?.label).toBe('Se aloja en');
    expect(homeRow('customer', 'u1', unitOf)).toBeNull();
    expect(homeRow('resident', null, unitOf)).toBeNull();
    expect(homeRow('resident', 'u9', unitOf)).toBeNull();
  });

  it('counts the followed people in the list title', () => {
    expect(followedTitle(3)).toBe('Personas seguidas (3 de 20)');
  });
});

describe('follow star', () => {
  it('is an outlined Seguir star for a named person with room in the list', () => {
    expect(followStar(true, false, 5, false)).toEqual({
      label: 'Seguir',
      active: false,
      disabled: false,
      reason: undefined,
    });
  });

  it('is disabled with a reason for an unnamed person', () => {
    expect(followStar(false, false, 0, false)).toMatchObject({
      disabled: true,
      reason: 'Poné un nombre para seguir a esta persona.',
    });
  });

  it('is disabled with the limit message at 20 followed', () => {
    expect(followStar(true, false, 20, false)).toMatchObject({
      disabled: true,
      reason: 'Ya seguís a 20 personas.',
    });
  });

  it('is a filled Dejar de seguir star for a followed person, even with 20 followed', () => {
    expect(followStar(true, true, 20, false)).toEqual({
      label: 'Dejar de seguir',
      active: true,
      disabled: false,
      reason: undefined,
    });
  });

  it('is disabled without a reason once the person is gone', () => {
    expect(followStar(true, false, 3, true)).toMatchObject({
      disabled: true,
      reason: undefined,
    });
    expect(followStar(true, true, 3, true)).toMatchObject({ disabled: true });
  });
});

describe('stress bar and reasons', () => {
  const none = {
    wait: 0,
    ride: 0,
    stairs: 0,
    queue: 0,
    noRoute: 0,
    walk: 0,
    noise: 0,
    dirt: 0,
    calm: 0,
  };

  it('fills the bar from 0 to 10 and writes the score with one decimal', () => {
    expect(stressBar(0)).toEqual({ fill: 0, color: '#141218', text: '0,0 / 10' });
    expect(stressBar(10)).toEqual({ fill: 1, color: '#d81e2a', text: '10,0 / 10' });
    expect(stressBar(3.44)).toMatchObject({ fill: 0.344, text: '3,4 / 10' });
  });

  it('moves the color smoothly from ink to red with the score', () => {
    expect(stressBar(5).color).toBe('#761821');
  });

  it('names noise and dirt apart', () => {
    expect(stressReasons({ ...none, noise: 10, dirt: 5 }).unhappy).toEqual(['Ruido', 'Suciedad']);
    expect(stressReasons({ ...none, noise: 10, dirt: 0 }).unhappy).toEqual(['Ruido']);
  });

  it('lists nothing before the person has felt any stress', () => {
    expect(stressReasons(none)).toEqual({ unhappy: [], happy: [] });
  });

  it('puts the heaviest causes first and at most three', () => {
    const causes = { ...none, wait: 5, ride: 10, stairs: 20, queue: 8, walk: 1 };
    expect(stressReasons(causes).unhappy).toEqual([
      'Subir y bajar escaleras',
      'Viajes largos en ascensor',
      'Colas de ascensor llenas',
    ]);
  });

  it('is happy with calm places first, then the causes that barely weigh', () => {
    const causes = { ...none, wait: 40, calm: 3 };
    const { unhappy, happy } = stressReasons(causes);
    expect(unhappy).toEqual(['Esperas largas del ascensor']);
    expect(happy[0]).toBe('Lugares tranquilos');
    expect(happy).toHaveLength(3);
    expect(happy).not.toContain('Ascensores sin espera');
  });
});
