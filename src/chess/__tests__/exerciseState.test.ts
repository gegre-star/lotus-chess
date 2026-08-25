import {
  etatInitial,
  reduire,
  indiceDisponible,
  indiceCourant,
  casesIndice,
  pointsGagnes,
  type EtatExercice,
} from '../exerciseState';
import { EXERCISES } from '../exercises';

const ex = EXERCISES.find((e) => e.id === 'cc-premier-coup')!;
const juste = ex.attendus[0];
const toleré = ex.toleres![0];
const faux = 'a2a3';

const jouer = (etat: EtatExercice, uci: string) =>
  reduire(ex, etat, { type: 'proposer', uci, feedback: null });
const indice = (etat: EtatExercice) => reduire(ex, etat, { type: 'indice' });

describe('parcours d’un exercice', () => {
  it('commence sans erreur, sans indice et sans retour', () => {
    expect(etatInitial()).toMatchObject({ erreurs: 0, indicesVus: 0, resolu: false, feedback: null });
  });

  it('reconnaît la bonne réponse du premier coup', () => {
    const e = jouer(etatInitial(), juste);
    expect(e.resolu).toBe(true);
    expect(e.erreurs).toBe(0);
  });

  it('compte une erreur sur un mauvais coup', () => {
    expect(jouer(etatInitial(), faux).erreurs).toBe(1);
  });

  it('ne compte pas d’erreur pour un bon coup hors sujet', () => {
    const e = jouer(etatInitial(), toleré);
    expect(e.horsSujet).toBe(true);
    expect(e.resolu).toBe(false);
    expect(e.erreurs).toBe(0);
  });

  it('ignore toute proposition après la réussite', () => {
    const gagne = jouer(etatInitial(), juste);
    expect(jouer(gagne, faux)).toBe(gagne);
  });
});

describe('indices', () => {
  it('n’en propose aucun avant la première erreur', () => {
    expect(indiceDisponible(etatInitial())).toBe(false);
    expect(indice(etatInitial()).indicesVus).toBe(0);
  });

  it('en débloque un après une erreur', () => {
    const e = jouer(etatInitial(), faux);
    expect(indiceDisponible(e)).toBe(true);
    expect(indice(e).indicesVus).toBe(1);
  });

  it('n’en débloque pas après un simple hors-sujet', () => {
    expect(indiceDisponible(jouer(etatInitial(), toleré))).toBe(false);
  });

  it('les donne dans l’ordre, du plus léger à la solution', () => {
    let e = jouer(etatInitial(), faux);
    e = indice(e);
    expect(indiceCourant(ex, e)).toBe(ex.indices[0]);
    e = indice(e);
    expect(indiceCourant(ex, e)).toBe(ex.indices[1]);
    e = indice(e);
    expect(indiceCourant(ex, e)).toBe(ex.indices[2]);
    expect(indiceCourant(ex, e)!.solution).toBe(true);
  });

  it('s’arrête au troisième', () => {
    let e = jouer(etatInitial(), faux);
    for (let i = 0; i < 6; i += 1) e = indice(e);
    expect(e.indicesVus).toBe(3);
    expect(indiceDisponible(e)).toBe(false);
  });

  it('n’en propose plus une fois l’exercice résolu', () => {
    const e = jouer(jouer(etatInitial(), faux), juste);
    expect(indiceDisponible(e)).toBe(false);
  });

  it('révèle la solution sur demande, sans passer par les paliers', () => {
    const e = reduire(ex, etatInitial(), { type: 'reveler' });
    expect(e.indicesVus).toBe(3);
    expect(indiceCourant(ex, e)!.solution).toBe(true);
  });

  it('remonte les cases à surligner', () => {
    const e = indice(jouer(etatInitial(), faux));
    expect(casesIndice(ex, e)).toEqual(ex.indices[0].cases);
    expect(casesIndice(ex, etatInitial())).toEqual([]);
  });
});

describe('points', () => {
  it('n’en donne aucun tant que l’exercice n’est pas résolu', () => {
    expect(pointsGagnes(etatInitial())).toBe(0);
    expect(pointsGagnes(jouer(etatInitial(), faux))).toBe(0);
  });

  it('donne le plein tarif sans indice', () => {
    expect(pointsGagnes(jouer(etatInitial(), juste))).toBe(20);
  });

  it('décroît avec le nombre d’indices, sans jamais s’annuler', () => {
    let e = jouer(etatInitial(), faux);
    const scores: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      e = indice(e);
      scores.push(pointsGagnes(jouer(e, juste)));
    }
    expect(scores).toEqual([12, 8, 4]);
    scores.forEach((s) => expect(s).toBeGreaterThan(0));
  });
});

describe('recommencer', () => {
  it('remet tout à zéro', () => {
    let e = indice(jouer(etatInitial(), faux));
    e = reduire(ex, e, { type: 'recommencer' });
    expect(e).toEqual(etatInitial());
  });
});
