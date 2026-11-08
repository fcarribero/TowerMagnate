import { describe, expect, it } from 'vitest';
import type { PersonInspect } from '../../model/inspectStore';
import {
  destinationText,
  followButtonState,
  personTitle,
  stateText,
  stressClass,
  stressText,
} from './personWindowModel';

const person: PersonInspect = {
  kind: 'person',
  id: 'p1',
  name: null,
  personKind: 'officeWorker',
  state: 'walk',
  destination: { kind: 'unit', unitId: 'u1', level: 12 },
  stressMinutes: 17.4,
  stress: 'stressed',
  homeUnitId: 'u1',
};
const unitOf = () => ({ name: null, type: 'office' as const, level: 12 });

describe('person window model', () => {
  it('titles an unnamed person by kind', () => {
    expect(personTitle(null, 'officeWorker')).toBe('Oficinista');
    expect(personTitle('Ana', 'officeWorker')).toBe('Ana');
  });

  it('shows stress minutes with the level word', () => {
    expect(stressText(17.4, 'stressed')).toBe('17 min (alto)');
    expect(stressText(0, 'normal')).toBe('0 min (normal)');
    expect(stressText(200, 'veryStressed')).toBe('200 min (muy alto)');
  });

  it('colors the stress by band', () => {
    expect(stressClass('stressed')).toBe('is-stressed');
    expect(stressClass('veryStressed')).toBe('is-veryStressed');
  });

  it('describes state and destination', () => {
    expect(stateText(person, unitOf)).toBe('Caminando');
    expect(stateText({ ...person, state: 'inside' }, unitOf)).toBe('En Oficina');
    expect(destinationText(person, unitOf)).toBe('Oficina · Piso 12');
    expect(destinationText({ ...person, destination: { kind: 'exit' } }, unitOf)).toBe(
      'Sale de la torre',
    );
    expect(destinationText({ ...person, destination: null }, unitOf)).toBe('Ninguno');
  });

  it('needs a name to follow', () => {
    const state = followButtonState({ name: null, followed: false, followedCount: 0, gone: false });
    expect(state.disabled).toBe(true);
    expect(state.tooltip).toBe('Poné un nombre para seguir a esta persona.');
  });

  it('blocks following at 20 with the limit message', () => {
    const state = followButtonState({
      name: 'Ana',
      followed: false,
      followedCount: 20,
      gone: false,
    });
    expect(state.disabled).toBe(true);
    expect(state.tooltip).toBe('Ya seguís a 20 personas.');
  });

  it('lets a followed person be unfollowed even at 20', () => {
    const state = followButtonState({
      name: 'Ana',
      followed: true,
      followedCount: 20,
      gone: false,
    });
    expect(state.disabled).toBe(false);
  });

  it('disables the button for a person who left', () => {
    const state = followButtonState({ name: 'Ana', followed: false, followedCount: 3, gone: true });
    expect(state.disabled).toBe(true);
  });
});
