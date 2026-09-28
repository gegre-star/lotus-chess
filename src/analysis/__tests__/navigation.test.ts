import {
  ETAT_INITIAL,
  fauteVoisine,
  jouerVariante,
  naviguer,
  numeroter,
  type ContexteNavigation,
  type EtatRevue,
} from '../navigation';
import { coupDepuisUci } from '../uci';
import { START_FEN, parseFEN } from '../../chess/engine';
import type { Verdict } from '../../chess/coaching';

/**
 * Partie fabriquée de 8 demi-coups (blancs aux indices pairs). Fautes des
 * blancs : l'indice 2 seulement (l'indice 4 n'est qu'une imprécision). Fautes
 * des noirs : 1 (gaffe) et 5 (erreur).
 */
const verdicts: Verdict[] = ['bon', 'gaffe', 'erreur', 'bon', 'imprecision', 'erreur', 'bon', 'bon'];
const coups = verdicts.map((verdict, i) => ({ camp: (i % 2 === 0 ? 'w' : 'b') as 'w' | 'b', verdict }));
const ctx = (over: Partial<ContexteNavigation> = {}): ContexteNavigation => ({
  coups,
  joueur: 'w',
  longueurSuite: 3,
  ...over,
});

describe('navigation dans la revue', () => {
  it('démarre sur la position de départ, hors variante', () => {
    expect(ETAT_INITIAL).toEqual({ index: 0, suite: null });
  });

  it('avance et recule d’une position, sans sortir de la partie', () => {
    let e = ETAT_INITIAL;
    e = naviguer(e, { type: 'suivant' }, ctx());
    expect(e.index).toBe(1);
    e = naviguer(e, { type: 'precedent' }, ctx());
    expect(e.index).toBe(0);
    e = naviguer(e, { type: 'precedent' }, ctx());
    expect(e.index).toBe(0);
  });

  it('s’arrête sur la position finale, d’indice N', () => {
    let e: EtatRevue = { index: 7, suite: null };
    e = naviguer(e, { type: 'suivant' }, ctx());
    expect(e.index).toBe(8);
    e = naviguer(e, { type: 'suivant' }, ctx());
    expect(e.index).toBe(8);
  });

  it('saute à une position donnée, bornée à la partie', () => {
    expect(naviguer(ETAT_INITIAL, { type: 'aller', index: 5 }, ctx()).index).toBe(5);
    expect(naviguer(ETAT_INITIAL, { type: 'aller', index: 99 }, ctx()).index).toBe(8);
    expect(naviguer(ETAT_INITIAL, { type: 'aller', index: -3 }, ctx()).index).toBe(0);
  });

  describe('erreur suivante', () => {
    it('ne s’arrête que sur les fautes de l’élève (erreur ou gaffe), pas sur les imprécisions ni les coups adverses', () => {
      // fautes des blancs : seul l'indice 2 (l'indice 1 est une gaffe noire, 5 une erreur noire)
      expect(fauteVoisine(coups, 0, 'w', 1)).toBe(2);
      expect(fauteVoisine(coups, 2, 'w', 1)).toBeNull();
    });

    it('cherche pour les noirs quand l’élève joue les noirs', () => {
      expect(fauteVoisine(coups, 0, 'b', 1)).toBe(1);
      expect(fauteVoisine(coups, 1, 'b', 1)).toBe(5);
    });

    it('est strictement après la position courante : deux appels donnent deux erreurs', () => {
      let e = ETAT_INITIAL;
      const c = ctx({ joueur: 'b' });
      e = naviguer(e, { type: 'erreurSuivante' }, c);
      expect(e.index).toBe(1);
      e = naviguer(e, { type: 'erreurSuivante' }, c);
      expect(e.index).toBe(5);
    });

    it('ne bouge pas quand il n’y en a plus, et ne reboucle pas', () => {
      const e = { index: 5, suite: null };
      expect(naviguer(e, { type: 'erreurSuivante' }, ctx({ joueur: 'b' }))).toEqual(e);
    });

    it('revient en arrière avec « erreur précédente »', () => {
      const e = naviguer({ index: 7, suite: null }, { type: 'erreurPrecedente' }, ctx({ joueur: 'b' }));
      expect(e.index).toBe(5);
    });

    it('quitte la variante en sautant à l’erreur', () => {
      const e = naviguer({ index: 0, suite: 2 }, { type: 'erreurSuivante' }, ctx());
      expect(e).toEqual({ index: 2, suite: null });
    });
  });

  describe('meilleure suite', () => {
    it('s’ouvre au début de la variante, sur la position avant le coup', () => {
      const e = naviguer({ index: 2, suite: null }, { type: 'ouvrirSuite' }, ctx());
      expect(e).toEqual({ index: 2, suite: 0 });
    });

    it('se parcourt coup par coup et se borne à sa longueur', () => {
      let e = { index: 2, suite: 0 as number | null };
      for (let i = 0; i < 5; i += 1) e = naviguer(e, { type: 'suivant' }, ctx());
      expect(e).toEqual({ index: 2, suite: 3 });
      for (let i = 0; i < 5; i += 1) e = naviguer(e, { type: 'precedent' }, ctx());
      expect(e).toEqual({ index: 2, suite: 0 });
    });

    it('ne change pas la position de la partie tant qu’on est dans la variante', () => {
      const e = naviguer({ index: 4, suite: 1 }, { type: 'suivant' }, ctx());
      expect(e.index).toBe(4);
    });

    it('retourne à la partie à l’endroit où on l’a quittée', () => {
      const e = naviguer({ index: 4, suite: 2 }, { type: 'fermerSuite' }, ctx());
      expect(e).toEqual({ index: 4, suite: null });
    });

    it('se ferme quand on saute ailleurs dans la partie', () => {
      expect(naviguer({ index: 4, suite: 2 }, { type: 'aller', index: 1 }, ctx())).toEqual({
        index: 1,
        suite: null,
      });
    });

    it('ne s’ouvre pas sur la position finale ni sans variante', () => {
      expect(naviguer({ index: 8, suite: null }, { type: 'ouvrirSuite' }, ctx())).toEqual({
        index: 8,
        suite: null,
      });
      expect(naviguer({ index: 2, suite: null }, { type: 'ouvrirSuite' }, ctx({ longueurSuite: 0 }))).toEqual({
        index: 2,
        suite: null,
      });
    });
  });
});

describe('variante jouée', () => {
  const depart = parseFEN(START_FEN);

  it('déroule les coups UCI depuis une position, avec leur notation', () => {
    const v = jouerVariante(depart, ['e2e4', 'e7e5', 'g1f3']);
    expect(v.sans).toEqual(['e4', 'e5', 'Cf3']);
    expect(v.positions).toHaveLength(4);
    expect(v.positions[0]).toBe(depart);
    expect(v.positions[3].turn).toBe('b');
  });

  it('s’arrête au premier coup illégal au lieu de lever', () => {
    const v = jouerVariante(depart, ['e2e4', 'e2e4', 'g1f3']);
    expect(v.coups).toHaveLength(1);
    expect(v.positions).toHaveLength(2);
  });

  it('rend une variante vide pour une liste vide', () => {
    expect(jouerVariante(depart, []).positions).toEqual([depart]);
  });

  it('numérote les coups blancs « 3. » et les coups noirs « 3… »', () => {
    expect(numeroter(depart)).toBe('1.');
    const apres = jouerVariante(depart, ['e2e4']).positions[1];
    expect(numeroter(apres)).toBe('1…');
  });
});

describe('lecture d’un coup UCI', () => {
  it('trouve la promotion et refuse le reste', () => {
    const pos = parseFEN('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    expect(coupDepuisUci(pos, 'a7a8q')?.promotion).toBe('Q');
    expect(coupDepuisUci(pos, 'a7a8n')?.promotion).toBe('N');
    expect(coupDepuisUci(pos, 'a7a8')).toBeNull();
    expect(coupDepuisUci(pos, 'zz')).toBeNull();
    expect(coupDepuisUci(pos, 'a7a5')).toBeNull();
  });

  it('lit le roque par la case d’arrivée du roi', () => {
    const pos = parseFEN('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    expect(coupDepuisUci(pos, 'e1g1')?.castle).toBe('K');
    expect(coupDepuisUci(pos, 'e1c1')?.castle).toBe('Q');
  });
});
