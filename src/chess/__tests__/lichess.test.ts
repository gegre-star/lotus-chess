import { PROBLEMES_LICHESS } from '../problemes-lichess';
import {
  NOTE_INITIALE,
  NOTE_MAX,
  NOTE_MIN,
  caseIndice,
  choisirProbleme,
  coupDepuisUci,
  coupsRestants,
  demarrer,
  jouer,
  libelleTheme,
  nouvelleNote,
  themeDe,
  type EtatLichess,
} from '../lichess';
import { legalMoves, parseFEN } from '../engine';

/** Rejoue la solution complète d'un problème, comme le ferait l'élève. */
function resoudre(etat: EtatLichess): EtatLichess {
  let courant = etat;
  while (!courant.resolu) {
    const coup = coupDepuisUci(courant.position, courant.probleme.coups[courant.etape]);
    if (!coup) throw new Error(`Problème ${courant.probleme.id} : coup attendu introuvable`);
    const v = jouer(courant, coup);
    if (v.type !== 'juste') throw new Error(`Problème ${courant.probleme.id} : solution refusée`);
    courant = v.etat;
  }
  return courant;
}

describe('base de problèmes importée', () => {
  it('contient plusieurs centaines de problèmes sur toute l’échelle de niveau', () => {
    expect(PROBLEMES_LICHESS.length).toBeGreaterThanOrEqual(500);
    const niveaux = PROBLEMES_LICHESS.map((p) => p.rating);
    expect(Math.min(...niveaux)).toBeLessThanOrEqual(700);
    expect(Math.max(...niveaux)).toBeGreaterThanOrEqual(2300);
  });

  it('n’a aucun doublon d’identifiant', () => {
    const ids = PROBLEMES_LICHESS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('chaque position contient les deux rois', () => {
    for (const p of PROBLEMES_LICHESS) {
      const pos = parseFEN(p.fen);
      expect(pos.board.filter((c) => c === 'K' || c === 'k')).toHaveLength(2);
    }
  });

  it('chaque problème démarre sur un coup adverse légal et se résout en jouant sa ligne', () => {
    for (const p of PROBLEMES_LICHESS) {
      expect(resoudre(demarrer(p)).resolu).toBe(true);
    }
  });

  it('l’élève joue le camp qui a le trait après le coup adverse', () => {
    for (const p of PROBLEMES_LICHESS) {
      const etat = demarrer(p);
      expect(etat.joueur).toBe(etat.position.turn);
      expect(etat.joueur).not.toBe(parseFEN(p.fen).turn);
    }
  });

  it('les deux couleurs sont représentées', () => {
    const couleurs = new Set(PROBLEMES_LICHESS.map((p) => demarrer(p).joueur));
    expect(couleurs).toEqual(new Set(['w', 'b']));
  });
});

describe('correction coup par coup', () => {
  const probleme = PROBLEMES_LICHESS.find((p) => p.coups.length >= 4)!;

  it('un mauvais coup est refusé', () => {
    const etat = demarrer(probleme);
    const bon = coupDepuisUci(etat.position, probleme.coups[1])!;
    const autres = legalMoves(etat.position).filter(
      (m) => !(m.from === bon.from && m.to === bon.to && m.promotion === bon.promotion),
    );
    expect(autres.length).toBeGreaterThan(0);
    let refuses = 0;
    for (const m of autres) {
      // un mat alternatif est une bonne réponse : on ne compte que les refus
      if (jouer(etat, m).type === 'faux') refuses += 1;
    }
    expect(refuses).toBeGreaterThan(0);
  });

  it('un bon coup avance la ligne et joue la réponse adverse prévue', () => {
    const etat = demarrer(probleme);
    const v = jouer(etat, coupDepuisUci(etat.position, probleme.coups[1])!);
    expect(v.type).toBe('juste');
    if (v.type === 'juste') {
      expect(v.reponse).not.toBeNull();
      expect(v.etat.etape).toBe(3);
    }
  });

  it('l’indice donne la case de départ du bon coup', () => {
    expect(caseIndice(demarrer(probleme))).toBe(probleme.coups[1].slice(0, 2));
  });

  it('la solution montrée ne contient que les coups de l’élève', () => {
    const attendus = probleme.coups.slice(1).filter((_, i) => i % 2 === 0);
    expect(coupsRestants(demarrer(probleme))).toHaveLength(attendus.length);
  });

  it('un problème résolu n’accepte plus de coup', () => {
    const fin = resoudre(demarrer(probleme));
    const quelconque = legalMoves(fin.position)[0];
    if (quelconque) expect(jouer(fin, quelconque).type).toBe('faux');
  });
});

describe('niveau de l’élève (système Elo)', () => {
  it('une réussite fait monter la note, un échec la fait descendre', () => {
    expect(nouvelleNote(1000, 1000, { reussi: true, indice: false }, 30)).toBeGreaterThan(1000);
    expect(nouvelleNote(1000, 1000, { reussi: false, indice: false }, 30)).toBeLessThan(1000);
  });

  it('battre un problème plus dur rapporte plus qu’un problème facile', () => {
    const dur = nouvelleNote(1000, 1400, { reussi: true, indice: false }, 30) - 1000;
    const facile = nouvelleNote(1000, 600, { reussi: true, indice: false }, 30) - 1000;
    expect(dur).toBeGreaterThan(facile);
  });

  it('un indice coûte cher : réussir avec aide rapporte moins que sans aide', () => {
    const sans = nouvelleNote(1000, 1000, { reussi: true, indice: false }, 30);
    const avec = nouvelleNote(1000, 1000, { reussi: true, indice: true }, 30);
    expect(avec).toBeLessThan(sans);
  });

  it('les 20 premiers problèmes bougent plus la note', () => {
    const debut = nouvelleNote(1000, 1000, { reussi: true, indice: false }, 0) - 1000;
    const plusTard = nouvelleNote(1000, 1000, { reussi: true, indice: false }, 50) - 1000;
    expect(debut).toBeGreaterThan(plusTard);
  });

  it('la note reste dans les bornes', () => {
    expect(nouvelleNote(NOTE_MIN, 3000, { reussi: false, indice: false }, 99)).toBe(NOTE_MIN);
    expect(nouvelleNote(NOTE_MAX, 100, { reussi: true, indice: false }, 99)).toBe(NOTE_MAX);
    expect(NOTE_INITIALE).toBeGreaterThanOrEqual(NOTE_MIN);
  });
});

describe('choix du prochain problème', () => {
  it('choisit un problème proche du niveau', () => {
    const p = choisirProbleme(PROBLEMES_LICHESS, 1500, {}, () => 0);
    expect(Math.abs(p.rating - 1500)).toBeLessThan(120);
  });

  it('évite les problèmes déjà vus tant qu’il en reste', () => {
    const vus: Record<string, boolean> = {};
    const tires = new Set<string>();
    for (let i = 0; i < 25; i++) {
      const p = choisirProbleme(PROBLEMES_LICHESS, 1200, vus, () => 0);
      expect(tires.has(p.id)).toBe(false);
      tires.add(p.id);
      vus[p.id] = true;
    }
  });

  it('retombe sur la liste complète quand tout a été vu', () => {
    const vus = Object.fromEntries(PROBLEMES_LICHESS.map((p) => [p.id, true]));
    expect(() => choisirProbleme(PROBLEMES_LICHESS, 1200, vus, () => 0)).not.toThrow();
  });

  it('respecte le thème demandé quand il existe', () => {
    const theme = themeDe(PROBLEMES_LICHESS[100]);
    const p = choisirProbleme(PROBLEMES_LICHESS, 1500, {}, () => 0, theme);
    expect(themeDe(p)).toBe(theme);
  });

  it('chaque problème a un thème lisible en français', () => {
    for (const p of PROBLEMES_LICHESS) expect(libelleTheme(p).length).toBeGreaterThan(2);
  });
});
