/**
 * La pendule ne compte que des horodatages : on peut donc faire tomber un
 * drapeau sans attendre dix minutes.
 */
import { CADENCES, coupJoue, creer, drapeauTombe, formater, lire, reprendre } from '../pendule';

const cadence = (id: string) => CADENCES.find((c) => c.id === id)!;

describe('création', () => {
  test('une partie sans limite n’a pas de pendule', () => {
    expect(creer(cadence('libre'))).toBeNull();
  });

  test('chaque camp reçoit le temps de la cadence', () => {
    const p = creer(cadence('10'))!;
    expect(p.restant).toEqual([600_000, 600_000]);
    expect(p.actif).toBeNull();
  });

  test('les cadences proposées sont cohérentes', () => {
    expect(CADENCES.map((c) => c.id)).toContain('libre');
    CADENCES.forEach((c) => {
      expect(c.base).toBeGreaterThanOrEqual(0);
      expect(c.increment).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('déroulement', () => {
  test('rien ne court avant le premier coup', () => {
    const p = creer(cadence('5'))!;
    expect(lire(p, 1_000_000)).toEqual([300_000, 300_000]);
    expect(drapeauTombe(p, 9_999_999)).toBeNull();
  });

  test('le premier coup des blancs est gratuit et lance la pendule des noirs', () => {
    const p = coupJoue(creer(cadence('5'))!, 'w', 1_000);
    expect(p.actif).toBe('b');
    expect(p.restant).toEqual([300_000, 300_000]);
  });

  test('chaque camp paie le temps qu’il a pris', () => {
    let p = coupJoue(creer(cadence('5'))!, 'w', 0);
    p = coupJoue(p, 'b', 4_000); // les noirs ont mis 4 s
    expect(lire(p, 4_000)).toEqual([300_000, 296_000]);
    p = coupJoue(p, 'w', 11_000); // les blancs ont mis 7 s
    expect(lire(p, 11_000)).toEqual([293_000, 296_000]);
  });

  test('le temps du camp actif diminue en continu', () => {
    const p = coupJoue(creer(cadence('5'))!, 'w', 0);
    expect(lire(p, 10_000)[1]).toBe(290_000);
    expect(lire(p, 10_000)[0]).toBe(300_000);
  });

  test('l’incrément est ajouté après chaque coup, sauf le tout premier', () => {
    let p = coupJoue(creer(cadence('3+2'))!, 'w', 0);
    expect(p.restant[0]).toBe(180_000); // premier coup : pas d'incrément
    p = coupJoue(p, 'b', 5_000);
    expect(p.restant[1]).toBe(180_000 - 5_000 + 2_000);
  });

  test('le drapeau tombe pour le camp dont le temps est écoulé', () => {
    let p = coupJoue(creer(cadence('3+2'))!, 'w', 0);
    expect(drapeauTombe(p, 100_000)).toBeNull();
    expect(drapeauTombe(p, 180_000)).toBe('b');
    p = coupJoue(p, 'b', 10_000);
    expect(drapeauTombe(p, 10_000 + 200_000)).toBe('w');
  });

  test('le temps ne devient jamais négatif', () => {
    const p = coupJoue(creer(cadence('5'))!, 'w', 0);
    expect(lire(p, 10_000_000)[1]).toBe(0);
  });

  test('une horloge qui recule ne donne pas de temps en plus', () => {
    const p = coupJoue(creer(cadence('5'))!, 'w', 10_000);
    expect(lire(p, 5_000)[1]).toBe(300_000);
  });
});

describe('reprise après interruption', () => {
  test('le temps où l’application était fermée n’est pas compté', () => {
    let p = coupJoue(creer(cadence('5'))!, 'w', 0);
    p = coupJoue(p, 'b', 3_000);
    // on rouvre la page une heure plus tard
    const repris = reprendre(p, 3_600_000);
    expect(lire(repris, 3_600_000)).toEqual(lire(p, 3_000));
    expect(drapeauTombe(repris, 3_600_000)).toBeNull();
  });
});

describe('affichage', () => {
  test.each([
    [600_000, '10:00'],
    [59_000, '0:59'],
    [61_000, '1:01'],
    [20_000, '0:20'],
    [19_900, '19.9'],
    [5_400, '5.4'],
    [0, '0.0'],
    [-500, '0.0'],
  ])('%i ms → %s', (ms, attendu) => {
    expect(formater(ms)).toBe(attendu);
  });
});
