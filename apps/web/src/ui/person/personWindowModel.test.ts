import type { UnitView } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import {
  destinationText,
  followButton,
  followedTitle,
  homeRow,
  kindName,
  personTitle,
  stateText,
  stressColor,
  stressText,
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
    expect(kindName('guard')).toBe('Guardia de seguridad');
  });

  it('writes the stress as minutes and level', () => {
    expect(stressText(12.4, 'normal')).toEqual({ text: '12 min (normal)', level: 'normal' });
    expect(stressText(40, 'stressed').text).toBe('40 min (alto)');
    expect(stressText(95, 'veryStressed').text).toBe('95 min (muy alto)');
  });

  it('uses the tower palette for stress colors', () => {
    expect(stressColor('stressed')).toBe('#f07aa8');
    expect(stressColor('veryStressed')).toBe('#d81e2a');
  });

  it('names what the person is doing', () => {
    expect(stateText('walk', undefined)).toBe('Caminando');
    expect(stateText('wait', undefined)).toBe('Esperando el ascensor');
    expect(stateText('ride', undefined)).toBe('En el ascensor');
    expect(stateText('stairs', undefined)).toBe('En la escalera');
    expect(stateText('noRoute', undefined)).toBe('Sin ruta');
    expect(stateText('outside', undefined)).toBe('Fuera de la torre');
    expect(stateText('inside', named)).toBe('En Estudio');
    expect(stateText('inside', office)).toBe('En Oficina');
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

describe('follow button', () => {
  it('is a primary Seguir for a named person with room in the list', () => {
    expect(followButton(true, false, 5, false)).toEqual({
      label: 'Seguir',
      isPrimary: true,
      disabled: false,
      tooltip: undefined,
    });
  });

  it('is disabled with a tooltip for an unnamed person', () => {
    expect(followButton(false, false, 0, false)).toMatchObject({
      disabled: true,
      tooltip: 'Poné un nombre para seguir a esta persona.',
    });
  });

  it('is disabled with the limit message at 20 followed', () => {
    expect(followButton(true, false, 20, false)).toMatchObject({
      disabled: true,
      tooltip: 'Ya seguís a 20 personas.',
    });
  });

  it('is a plain Dejar de seguir for a followed person, even with 20 followed', () => {
    expect(followButton(true, true, 20, false)).toEqual({
      label: 'Dejar de seguir',
      isPrimary: false,
      disabled: false,
      tooltip: undefined,
    });
  });

  it('is disabled without a tooltip once the person is gone', () => {
    expect(followButton(true, false, 3, true)).toMatchObject({
      disabled: true,
      tooltip: undefined,
    });
    expect(followButton(true, true, 3, true)).toMatchObject({ disabled: true });
  });
});
