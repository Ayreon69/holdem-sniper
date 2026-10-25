import { describe, expect, it } from 'vitest';
import { compareFull, evaluate, handName, isValidHandId, opponentDistribution } from '../shared/hands';
import { chipPlan } from '../shared/protocol';

describe('évaluation des mains', () => {
  it('reconnaît les exemples des règles officielles', () => {
    expect(evaluate([7, 7, 7, 7, 2, 1])).toEqual({ cat: 'quads', key: 7 });
    expect(evaluate([7, 7, 7, 2, 2, 1])).toEqual({ cat: 'fullhouse', key: 7 });
    expect(evaluate([10, 9, 8, 7, 6, 1])).toEqual({ cat: 'straight', key: 10 });
    expect(evaluate([7, 7, 7, 4, 2, 1])).toEqual({ cat: 'trips', key: 7 });
    expect(evaluate([7, 7, 2, 2, 9, 1])).toEqual({ cat: 'twopair', key: 7 });
    expect(evaluate([7, 7, 2, 4, 9, 1])).toEqual({ cat: 'pair', key: 7 });
    expect(evaluate([9, 7, 6, 4, 2, 1])).toEqual({ cat: 'high', key: 9 });
  });

  it("annonce un full avec le chiffre du brelan, même s'il y a deux brelans", () => {
    expect(evaluate([4, 4, 4, 7, 7, 1])).toEqual({ cat: 'fullhouse', key: 4 });
    expect(evaluate([4, 4, 4, 9, 9, 9])).toEqual({ cat: 'fullhouse', key: 9 });
  });

  it('prend la suite la plus haute et ignore le bouclage 10-1', () => {
    expect(evaluate([1, 2, 3, 4, 5, 6])).toEqual({ cat: 'straight', key: 6 });
    expect(evaluate([7, 8, 9, 10, 1, 2])).toEqual({ cat: 'high', key: 10 });
  });

  it('classe la suite au-dessus du brelan', () => {
    const straight = evaluate([4, 5, 6, 7, 8, 8]);
    expect(straight.cat).toBe('straight');
    expect(compareFull(straight, [8, 8], evaluate([9, 9, 9, 1, 2, 3]), [9, 1])).toBeGreaterThan(0);
  });

  it('départage par chiffre puis cartes privées', () => {
    const a = evaluate([10, 1, 7, 7, 3, 4]);
    const b = evaluate([10, 2, 7, 7, 3, 4]);
    expect(a).toEqual(b);
    expect(compareFull(a, [10, 1], b, [10, 2])).toBeLessThan(0);
    expect(compareFull(a, [1, 10], b, [10, 1])).toBe(0);
  });

  it('nomme les mains comme on les annonce', () => {
    expect(handName({ cat: 'straight', key: 8 })).toBe('Suite au 8');
    expect(handName({ cat: 'fullhouse', key: 7 })).toBe('Full aux 7');
    expect(handName({ cat: 'twopair', key: 7 })).toBe('Double paire aux 7');
  });

  it('valide les annonces', () => {
    expect(isValidHandId('straight', 4)).toBe(false);
    expect(isValidHandId('straight', 5)).toBe(true);
    expect(isValidHandId('twopair', 1)).toBe(false);
    expect(isValidHandId('flush', 5)).toBe(false);
  });

  it('calcule une distribution adverse cohérente', () => {
    const dist = opponentDistribution([7, 7, 3, 4], [10, 1]);
    const total = [...dist.values()].reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(1, 6);
    expect(dist.has('high:10')).toBe(false); // la paire de 7 est déjà sur le tableau
    expect((dist.get('pair:7') ?? 0) > 0.3).toBe(true);
  });
});

describe('plan de jetons', () => {
  it("reproduit l'émission à 5 joueurs", () => {
    expect(chipPlan('show', 5)).toEqual({ start: 60, target: 75 });
  });
  it('garantit départ × n = objectif × (n − 1)', () => {
    for (const preset of ['express', 'standard', 'show'] as const) {
      for (let n = 2; n <= 8; n++) {
        const { start, target } = chipPlan(preset, n);
        expect(Number.isInteger(target)).toBe(true);
        expect(start * n).toBe(target * (n - 1));
      }
    }
  });
});
