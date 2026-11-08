import { describe, expect, it } from 'vitest';
import { snapshot } from '../../testing/protocolFixtures';
import { isNewTower, messagesForEvents, unitsUnlockedAt } from './infoDialogModel';

describe('unitsUnlockedAt', () => {
  it('lists the units each rating unlocks, without elevators', () => {
    expect(unitsUnlockedAt(2)).toEqual([
      'Habitación simple',
      'Habitación doble',
      'Suite',
      'Limpieza',
      'Seguridad',
    ]);
    expect(unitsUnlockedAt(3)).toEqual([
      'Restaurante',
      'Local comercial',
      'Cine',
      'Salón de fiestas',
      'Centro médico',
      'Rampa de estacionamiento',
      'Cochera',
      'Centro de reciclaje',
    ]);
    expect(unitsUnlockedAt(4)).toEqual(['Estación de subte']);
    expect(unitsUnlockedAt(5)).toEqual(['Catedral']);
  });
});

describe('messagesForEvents', () => {
  it('words the new stars dialog with the units the rating unlocks', () => {
    const [message] = messagesForEvents([{ type: 'starsChanged', step: 5, stars: 4 }]);

    expect(message).toEqual({
      title: '¡4 estrellas!',
      body: 'La torre llegó a 4 estrellas. Ahora podés construir: Estación de subte.',
    });
  });

  it('opens only the tower rank dialog when the wedding brings rating 6', () => {
    const messages = messagesForEvents([
      { type: 'starsChanged', step: 5, stars: 6 },
      { type: 'weddingCompleted', step: 5 },
    ]);

    expect(messages.map((message) => message.title)).toEqual(['¡Rango Torre!']);
  });

  it('keeps the order of the events and ignores the rest', () => {
    const messages = messagesForEvents([
      { type: 'starsChanged', step: 5, stars: 2 },
      { type: 'starBlocked', step: 5, reason: 'security' },
      { type: 'starsChanged', step: 5, stars: 3 },
    ]);

    expect(messages.map((message) => message.title)).toEqual(['¡2 estrellas!', '¡3 estrellas!']);
  });
});

describe('isNewTower', () => {
  it('is true only at step 0 with nothing built', () => {
    expect(isNewTower({ step: 0, units: [] })).toBe(true);
    expect(isNewTower({ step: 0, units: snapshot.units })).toBe(false);
    expect(isNewTower({ step: 12, units: [] })).toBe(false);
  });
});
