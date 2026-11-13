import type { PersonKind } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  HAIR_COLORS,
  MAX_SCALE_X,
  MAX_SCALE_Y,
  MIN_SCALE_X,
  MIN_SCALE_Y,
  SHIRT_COLORS,
  SKIN_TONES,
  computeLook,
  hashId,
  multiplyColors,
  personLook,
} from './personLook';

const IDS = Array.from({ length: 2000 }, (_, index) => `p${index + 1}`);
const KINDS: PersonKind[] = [
  'officeWorker',
  'resident',
  'hotelGuest',
  'customer',
  'audience',
  'partyGuest',
  'maid',
  'guard',
  'vip',
  'weddingGuest',
  'prospect',
  'builder',
  'staff',
];

describe('personLook', () => {
  it('gives the same look for the same id, every time and for the cached call too', () => {
    for (const id of IDS.slice(0, 50)) {
      expect(computeLook(id, 'officeWorker')).toEqual(computeLook(id, 'officeWorker'));
      expect(personLook(id, 'officeWorker')).toEqual(computeLook(id, 'officeWorker'));
      expect(personLook(id, 'officeWorker')).toBe(personLook(id, 'officeWorker'));
    }
    expect(hashId('p42')).toBe(hashId('p42'));
  });

  it('picks the look from the id alone, not from stress or time', () => {
    expect(computeLook('p7', 'resident')).toEqual(computeLook('p7', 'resident'));
    expect(computeLook('p7', 'resident').skin).toBe(computeLook('p7', 'officeWorker').skin);
    expect(computeLook('p7', 'resident').hair).toBe(computeLook('p7', 'officeWorker').hair);
    expect(computeLook('p7', 'resident').scaleY).toBe(computeLook('p7', 'officeWorker').scaleY);
  });

  it('keeps height and build in range and in whole pixels', () => {
    for (const id of IDS) {
      const look = computeLook(id, 'officeWorker');
      expect(look.scaleY).toBeGreaterThanOrEqual(MIN_SCALE_Y);
      expect(look.scaleY).toBeLessThanOrEqual(MAX_SCALE_Y);
      expect(look.scaleX).toBeGreaterThanOrEqual(MIN_SCALE_X);
      expect(look.scaleX).toBeLessThanOrEqual(MAX_SCALE_X);
      expect(Number.isInteger(look.scaleY * FRAME_HEIGHT)).toBe(true);
      expect(Number.isInteger(look.scaleX * FRAME_WIDTH)).toBe(true);
    }
    expect(MIN_SCALE_Y).toBeCloseTo(1 - 0.125, 5);
    expect(MAX_SCALE_Y).toBeCloseTo(1 + 0.125, 5);
    expect(MIN_SCALE_X).toBeCloseTo(1 - 0.125, 5);
    expect(MAX_SCALE_X).toBeCloseTo(1 + 0.25, 5);
  });

  it('spreads people over every skin tone, many hair colors, shirts, heights and builds', () => {
    const looks = IDS.map((id) => computeLook(id, 'officeWorker'));
    expect(new Set(looks.map((look) => look.skin)).size).toBe(SKIN_TONES.length);
    expect(new Set(looks.map((look) => look.hair)).size).toBeGreaterThanOrEqual(10);
    expect(new Set(looks.map((look) => look.shirt)).size).toBeGreaterThanOrEqual(
      SHIRT_COLORS.length - 2,
    );
    expect(new Set(looks.map((look) => look.pants)).size).toBeGreaterThanOrEqual(10);
    expect(new Set(looks.map((look) => look.scaleY)).size).toBe(5);
    expect(new Set(looks.map((look) => look.scaleX)).size).toBe(4);
    const women = looks.filter((look) => look.model === 'woman').length;
    expect(women).toBeGreaterThan(IDS.length * 0.4);
    expect(women).toBeLessThan(IDS.length * 0.6);
  });

  it('gives neighbors different looks', () => {
    const keys = IDS.slice(0, 200).map((id) => {
      const look = computeLook(id, 'officeWorker');
      return [
        look.model,
        look.skin,
        look.hair,
        look.shirt,
        look.pants,
        look.scaleX,
        look.scaleY,
      ].join();
    });
    expect(new Set(keys).size).toBeGreaterThan(190);
  });

  it('keeps hair, skin and shirt colors from the palettes', () => {
    for (const id of IDS.slice(0, 300)) {
      const look = computeLook(id, 'officeWorker');
      expect(SKIN_TONES).toContain(look.skin);
      expect(HAIR_COLORS).toContain(look.hair);
      expect(SHIRT_COLORS).toContain(look.shirt);
    }
  });

  it('keeps the uniform colors of each uniform type and varies the rest', () => {
    const guards = IDS.map((id) => computeLook(id, 'guard'));
    expect(new Set(guards.map((look) => look.shirt))).toEqual(new Set([0x2f4f9a]));
    expect(new Set(guards.map((look) => look.pants))).toEqual(new Set([0x141218]));
    expect(new Set(guards.map((look) => look.skin)).size).toBe(SKIN_TONES.length);
    expect(new Set(guards.map((look) => look.scaleY)).size).toBeGreaterThan(2);
    expect(guards.every((look) => look.subjects.fixed.startsWith('people/fixed-security-'))).toBe(
      true,
    );
    const builders = IDS.map((id) => computeLook(id, 'builder'));
    expect(new Set(builders.map((look) => look.shirt))).toEqual(new Set([0xe0875a]));
  });

  it('dresses the maid as a woman and the bag carrier as the crew with a bag', () => {
    for (const id of IDS.slice(0, 100)) {
      const maid = computeLook(id, 'maid');
      expect(maid.model).toBe('woman');
      expect(maid.subjects.fixed).toBe('people/fixed-maid-woman');
      expect(computeLook(id, 'staff', true).subjects.fixed).toMatch(/^people\/fixed-staffbag-/);
      expect(computeLook(id, 'staff').subjects.fixed).toMatch(/^people\/fixed-staff-/);
    }
  });

  it('uses one base model per gender and the matching lower body', () => {
    for (const id of IDS.slice(0, 100)) {
      for (const kind of KINDS) {
        const look = computeLook(id, kind);
        expect(look.subjects.skin).toBe(`people/skin-${look.model}`);
        expect(look.subjects.hair).toBe(`people/hair-${look.model}`);
        expect(look.subjects.pants).toBe(
          look.model === 'man' ? 'people/pants-trousers' : 'people/pants-skirt',
        );
      }
    }
  });
});

describe('multiplyColors', () => {
  it('leaves a color alone with white and darkens it with gray', () => {
    expect(multiplyColors(0xe6b48a, 0xffffff)).toBe(0xe6b48a);
    expect(multiplyColors(0xffffff, 0xffffff)).toBe(0xffffff);
    expect(multiplyColors(0xff8000, 0x808080)).toBe(0x804000);
  });
});
