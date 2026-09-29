/**
 * Les preuves des exercices : ce que le moteur en dit, et ce qu'un solveur
 * exact en dit pour les finales de pion.
 *
 * Les exercices d'origine se vérifient avec le minimax de l'application
 * (`exercises.test.ts`, trois demi-coups). Il ne suffit pas pour les finales :
 * la règle du carré, la case clé, Lucena, la défense Philidor se jouent sur
 * dix, vingt coups, bien au-delà de son horizon, et il ne voit pas non plus
 * qu'un roque est interdit. Deux sources de preuve prennent le relais.
 *
 * **Stockfish**, dont l'évaluation de chaque coup légal est figée dans
 * `donnees/preuves-stockfish.json` (voir `generer-preuves.cjs`). Le fichier
 * n'est jamais cru sur parole : on vérifie qu'il décrit la position de
 * l'exercice, coup légal pour coup légal.
 *
 * **Un solveur exact de roi et pion contre roi**, écrit ici, qui rend le
 * verdict — gain ou nulle — sans aucune heuristique. C'est lui qui tranche
 * l'opposition (F8) et qui recoupe Stockfish sur la règle du carré et la
 * case clé.
 */
import preuves from './donnees/preuves-stockfish.json';
import { LESSONS } from '../content';
import { EXERCISES, type Exercise } from '../exercises';
import {
  findMove,
  inCheck,
  isAttacked,
  legalMoves,
  makeMove,
  parseFEN,
  squareFromName as at,
  squareName,
  type Move,
  type Position,
} from '../engine';

// ------------------------------------------------------------ Stockfish

type Score = { cp: number } | { mat: number };
interface Preuves {
  moteur: string;
  profondeur: number;
  positions: Record<string, { coups: Record<string, Score> }>;
}
const PREUVES = preuves as unknown as Preuves;

/** Un score en une seule échelle : un mat en n coups vaut 100000 − n. */
const valeur = (s: Score): number => ('cp' in s ? s.cp : s.mat > 0 ? 100000 - s.mat : -100000 - s.mat);
const estMat = (v: number): boolean => v >= 90000;

/** Écart au meilleur coup en deçà duquel un coup est « aussi bon », en centièmes de pion. */
const MARGE_BON = 60;
/** Écart au meilleur coup au-delà duquel un coup toléré ne serait plus un bon coup. */
const MARGE_TOLERE = 100;

const uci = (m: Move): string =>
  `${squareName(m.from)}${squareName(m.to)}${m.promotion ? m.promotion.toLowerCase() : ''}`;

/**
 * Les coups « aussi bons que le meilleur ».
 *
 * Quand le meilleur coup mate, c'est le mat le plus rapide qui compte — un mat
 * plus lent ne répond pas à « mate en deux coups », c'est la règle de
 * `isGoodMove`. Sinon, tout coup à moins de 60 centièmes de pion du meilleur.
 */
function bons(coups: Record<string, Score>): string[] {
  const valeurs = Object.entries(coups).map(([u, s]) => [u, valeur(s)] as const);
  const meilleur = Math.max(...valeurs.map(([, v]) => v));
  if (estMat(meilleur)) return valeurs.filter(([, v]) => v >= meilleur).map(([u]) => u);
  return valeurs.filter(([, v]) => v >= meilleur - MARGE_BON).map(([u]) => u);
}

/**
 * Exercices d'ouverture dont la consigne est thématique — « occupe le centre »,
 * « sors ton cavalier du bon côté » — et non un unique meilleur coup : en
 * ouverture une dizaine de coups sont à quelques centièmes de pion, et les
 * lister tous dans `toleres` n'aurait aucun sens. Ils restent vérifiés par le
 * minimax à cinq centièmes de `exercises.test.ts`, et ici pour ce qu'ils
 * acceptent : chaque coup attendu ou toléré doit être un bon coup.
 */
const CONSIGNE_THEMATIQUE = new Set(['cc-premier-coup', 'cc-cavalier-au-bord', 'cc-pousse-ou-defends']);

const exercice = (id: string): Exercise => EXERCISES.find((e) => e.id === id)!;

describe('preuves de Stockfish', () => {
  test('le fichier dit d’où il vient', () => {
    expect(PREUVES.moteur).toMatch(/Stockfish/);
    expect(PREUVES.profondeur).toBeGreaterThanOrEqual(14);
  });

  test.each(EXERCISES.map((e) => [e.id, e] as const))('%s : la preuve décrit bien la position', (_id, ex) => {
    const preuve = PREUVES.positions[ex.fen];
    // la position a-t-elle changé sans que le fichier soit régénéré ?
    expect(preuve && 'preuve présente').toBe('preuve présente');
    const legaux = legalMoves(parseFEN(ex.fen)).map(uci).sort();
    expect(Object.keys(preuve.coups).sort()).toEqual(legaux);
  });

  describe.each(EXERCISES.filter((e) => !e.regle).map((e) => [e.id, e] as const))('%s', (_id, ex) => {
    const coups = () => PREUVES.positions[ex.fen].coups;

    test('chaque coup attendu est un bon coup', () => {
      const b = bons(coups());
      ex.attendus.forEach((u) => expect(b).toContain(u));
    });

    test('chaque coup toléré est objectivement bon, sans être le coup demandé', () => {
      const valeurs = Object.values(coups()).map(valeur);
      const meilleur = Math.max(...valeurs);
      (ex.toleres ?? []).forEach((u) => {
        expect(valeur(coups()[u])).toBeGreaterThanOrEqual(meilleur - MARGE_TOLERE);
        expect(ex.attendus).not.toContain(u);
      });
    });

    if (!CONSIGNE_THEMATIQUE.has(ex.id)) {
      test('aucun autre bon coup n’est refusé : tout ce qui est aussi bon est attendu ou toléré', () => {
        const connus = [...ex.attendus, ...(ex.toleres ?? [])];
        bons(coups()).forEach((u) => expect(connus).toContain(u));
      });
    }
  });

  test('exercice « règle » : la réponse est un roque, et l’autre est illégal', () => {
    const ex = exercice('sr-roque-permis');
    expect(ex.regle).toBe(true);
    const pos = parseFEN(ex.fen);
    const roques = legalMoves(pos).filter((m) => m.castle);
    // le petit roque est interdit (f1 est attaquée par la tour noire), le grand est permis
    expect(roques.map(uci)).toEqual(['e1c1']);
    expect(ex.attendus).toEqual(['e1c1']);
    // les droits sont pourtant annoncés pour les deux : c'est la position qui interdit l'un
    expect(ex.fen.split(' ')[2]).toBe('KQ');
  });

  test('le nombre d’exercices reste cohérent avec les preuves', () => {
    // pas de preuve orpheline : le générateur les supprime, ce test le garantit
    const fens = new Set(EXERCISES.map((e) => e.fen));
    Object.keys(PREUVES.positions).forEach((f) => expect(fens.has(f)).toBe(true));
  });
});

// -------------------------------------------------------- F11 en détail

describe('F11 · exercices dont l’indice ou la position mentait', () => {
  test('« vp-mauvaise-reprise » : deux pièces peuvent bien reprendre en d4', () => {
    const ex = exercice('vp-mauvaise-reprise');
    const pos = parseFEN(ex.fen);
    const reprises = legalMoves(pos).filter((m) => squareName(m.to) === 'd4' && m.captured);
    // avant : une seule reprise (exd4) alors que l'indice en annonçait deux
    expect(reprises.map(uci).sort()).toEqual(['e3d4', 'f3d4']);
    expect(ex.indices[0].texte).toMatch(/pion e3/);
    expect(ex.indices[0].texte).toMatch(/cavalier f3/);
  });

  test('« vp-mauvaise-reprise » : reprendre avec le pion vaut nettement plus que reprendre avec le cavalier', () => {
    const ex = exercice('vp-mauvaise-reprise');
    const c = PREUVES.positions[ex.fen].coups;
    expect(valeur(c.e3d4) - valeur(c.f3d4)).toBeGreaterThanOrEqual(200);
  });

  test('« pp-sauve-la-tour » : laisser prendre la tour coûte 5 points, et l’indice le dit', () => {
    const ex = exercice('pp-sauve-la-tour');
    expect(ex.indices[1].texte).toMatch(/5 points/);
    expect(ex.indices[1].texte).not.toMatch(/2 points/);
    // la tour est sans défenseur : après Fxa1, rien ne reprend
    const noirs = parseFEN(ex.fen.replace(' w ', ' b '));
    const prise = legalMoves(noirs).find((m) => squareName(m.from) === 'd4' && squareName(m.to) === 'a1')!;
    expect(prise.captured).toBe('R');
    const reprises = legalMoves(makeMove(noirs, prise)).filter((m) => squareName(m.to) === 'a1');
    expect(reprises).toEqual([]);
    // et perdre la tour compte : l'ancienne position, sans pions, finissait roi contre roi et fou
    expect(parseFEN(ex.fen).board.filter((p) => p === 'P').length).toBeGreaterThan(0);
  });

  test('« pp-sauve-la-tour » : a5 n’est plus une réponse, ...Fc3+ y fourche le roi et la tour', () => {
    const ex = exercice('pp-sauve-la-tour');
    expect(ex.attendus).not.toContain('a1a5');
    const c = PREUVES.positions[ex.fen].coups;
    expect(valeur(c.a1a5)).toBeLessThan(-300);
    const apresA5 = makeMove(parseFEN(ex.fen), findMove(parseFEN(ex.fen), at('a1'), at('a5'))!);
    const fourchette = legalMoves(apresA5).find((m) => squareName(m.from) === 'd4' && squareName(m.to) === 'c3')!;
    const apresFc3 = makeMove(apresA5, fourchette);
    // Fc3 donne échec au roi e1 : seul un coup de roi y répond ...
    expect(inCheck(apresFc3, 'w')).toBe(true);
    expect(legalMoves(apresFc3).every((m) => squareName(m.from) === 'e1')).toBe(true);
    // ... et le fou vise toujours la tour a5 : la fourchette
    expect(isAttacked(apresFc3, at('a5'), 'b')).toBe(true);
  });

  test('« pp-sauve-la-tour » : tout coup qui n’écarte pas la tour perd au moins trois points', () => {
    const ex = exercice('pp-sauve-la-tour');
    const c = PREUVES.positions[ex.fen].coups;
    const meilleur = Math.max(...Object.values(c).map(valeur));
    Object.entries(c)
      .filter(([u]) => !ex.attendus.includes(u))
      .forEach(([u, s]) => expect(`${u}: ${meilleur - valeur(s) >= 300}`).toBe(`${u}: true`));
  });

  test('« pp-defends-plutot » : la position distingue Ta4 de tous les autres coups', () => {
    // avant, quinze coups sur seize valaient 0,00 : l'exercice ne discriminait rien
    const ex = exercice('pp-defends-plutot');
    const c = PREUVES.positions[ex.fen].coups;
    const meilleur = Math.max(...Object.values(c).map(valeur));
    Object.entries(c)
      .filter(([u]) => !ex.attendus.includes(u))
      .forEach(([u, s]) => expect(`${u}: ${meilleur - valeur(s) >= 100}`).toBe(`${u}: true`));
    expect(ex.attendus).toEqual(['a1a4']);
  });
});

// ----------------------------------------- solveur exact roi + pion / roi

/**
 * Solveur de finales roi et pion blanc contre roi.
 *
 * Une analyse rétrograde : on marque les positions gagnées pour les blancs
 * jusqu'à ce qu'il n'y en ait plus de nouvelle. Une position avec les blancs au
 * trait est gagnée si un coup mène à une position gagnée ; avec les noirs au
 * trait, si tous leurs coups y mènent — prendre le pion, ou le pat, sont des
 * nulles. La promotion est gagnée si la nouvelle dame (ou la tour, contre le
 * pat) n'est pas prise et que le roi noir n'est pas pat.
 *
 * Les cases sont numérotées comme dans `engine.ts` : 0 = a1, 63 = h8.
 */
const rangee = (s: number): number => s >> 3;
const colonne = (s: number): number => s & 7;
const distance = (a: number, b: number): number =>
  Math.max(Math.abs(colonne(a) - colonne(b)), Math.abs(rangee(a) - rangee(b)));
const VOISINS: number[][] = Array.from({ length: 64 }, (_, s) => {
  const out: number[] = [];
  for (let s2 = 0; s2 < 64; s2 += 1) if (s2 !== s && distance(s, s2) === 1) out.push(s2);
  return out;
});
const indice = (rb: number, rn: number, p: number, trait: 0 | 1): number => ((rb * 64 + rn) * 64 + p) * 2 + trait;

const attaquesDuPion = (p: number): number[] => {
  const out: number[] = [];
  if (colonne(p) > 0) out.push(p + 7);
  if (colonne(p) < 7) out.push(p + 9);
  return out;
};

/** La pièce promue en `q` (D ou T) est-elle bien gagnante, roi noir au trait ? */
function promotionGagne(rb: number, rn: number, q: number): boolean {
  for (const piece of ['D', 'T'] as const) {
    // la pièce est prise par le roi noir si celui-ci la touche et que le roi blanc ne la protège pas
    if (distance(rn, q) <= 1 && distance(rb, q) > 1) continue;
    const attaque = (d: number): boolean => {
      if (d === q) return false;
      const df = colonne(d) - colonne(q);
      const dr = rangee(d) - rangee(q);
      const droite = df === 0 || dr === 0;
      const diagonale = Math.abs(df) === Math.abs(dr);
      if (!(droite || (piece === 'D' && diagonale))) return false;
      const sf = Math.sign(df);
      const sr = Math.sign(dr);
      let f = colonne(q) + sf;
      let r = rangee(q) + sr;
      while (f !== colonne(d) || r !== rangee(d)) {
        if (r * 8 + f === rb) return false; // le roi blanc fait écran
        f += sf;
        r += sr;
      }
      return true;
    };
    const enEchec = attaque(rn);
    const fuites = VOISINS[rn].filter((n) => distance(n, rb) > 1 && !attaque(n) && n !== q);
    // pat : aucune fuite et pas d'échec — on essaie alors la sous-promotion en tour
    if (fuites.length > 0 || enEchec) return true;
  }
  return false;
}

let table: Uint8Array | null = null;

function resoudre(): Uint8Array {
  if (table) return table;
  const gagne = new Uint8Array(64 * 64 * 64 * 2);
  const pionsPossibles: number[] = [];
  for (let p = 8; p < 56; p += 1) pionsPossibles.push(p); // rangées 2 à 7
  let change = true;
  while (change) {
    change = false;
    for (let rb = 0; rb < 64; rb += 1) {
      for (let rn = 0; rn < 64; rn += 1) {
        if (rb === rn || distance(rb, rn) <= 1) continue;
        for (const p of pionsPossibles) {
          if (p === rb || p === rn) continue;
          const attaques = attaquesDuPion(p);
          // -- les blancs au trait (le roi noir ne peut pas être en prise au pion)
          const iB = indice(rb, rn, p, 0);
          if (!gagne[iB] && !attaques.includes(rn)) {
            let g = false;
            for (const n of VOISINS[rb]) {
              if (n === p || n === rn || distance(n, rn) <= 1) continue;
              if (gagne[indice(n, rn, p, 1)]) {
                g = true;
                break;
              }
            }
            if (!g) {
              const p1 = p + 8;
              if (p1 !== rb && p1 !== rn) {
                if (rangee(p1) === 7) g = promotionGagne(rb, rn, p1);
                else {
                  g = gagne[indice(rb, rn, p1, 1)] === 1;
                  if (!g && rangee(p) === 1) {
                    const p2 = p + 16;
                    if (p2 !== rb && p2 !== rn) g = gagne[indice(rb, rn, p2, 1)] === 1;
                  }
                }
              }
            }
            if (g) {
              gagne[iB] = 1;
              change = true;
            }
          }
          // -- les noirs au trait
          const iN = indice(rb, rn, p, 1);
          if (!gagne[iN]) {
            let coups = 0;
            let tousGagnes = true;
            for (const n of VOISINS[rn]) {
              if (distance(n, rb) <= 1 || attaques.includes(n)) continue;
              coups += 1;
              // prendre le pion (roi blanc trop loin pour le protéger) : roi contre roi, nulle
              if (n === p || !gagne[indice(rb, n, p, 0)]) {
                tousGagnes = false;
                break;
              }
            }
            const enEchec = attaques.includes(rn);
            // sans coup : mat si le roi noir est en échec, pat sinon
            const g = coups === 0 ? enEchec : tousGagnes;
            if (g) {
              gagne[iN] = 1;
              change = true;
            }
          }
        }
      }
    }
  }
  table = gagne;
  return gagne;
}

/** Verdict exact d'une position roi + pion blanc contre roi. */
function verdictKPK(pos: Position): 'gagne' | 'nulle' {
  const pieces = pos.board.map((p, s) => [p, s] as const).filter(([p]) => p);
  const roiB = pieces.find(([p]) => p === 'K')![1];
  const roiN = pieces.find(([p]) => p === 'k')![1];
  const pions = pieces.filter(([p]) => p === 'P');
  if (pieces.length !== 3 || pions.length !== 1) throw new Error('ce n’est pas une finale roi et pion contre roi');
  const p = pions[0][1];
  return resoudre()[indice(roiB, roiN, p, pos.turn === 'w' ? 0 : 1)] ? 'gagne' : 'nulle';
}

const verdict = (fen: string) => verdictKPK(parseFEN(fen));

describe('le solveur exact de roi et pion contre roi', () => {
  test('il retrouve des résultats classiques', () => {
    // pion de la colonne a : nulle, le roi noir gagne le coin
    expect(verdict('k7/8/K7/P7/8/8/8/8 w - - 0 1')).toBe('nulle');
    // pion à la 7e rangée, roi devant lui : gagné
    expect(verdict('8/1P6/1K6/8/8/8/8/k7 w - - 0 1')).toBe('gagne');
    // le roi adverse prend le pion s'il ne le protège pas
    expect(verdict('8/8/8/8/8/1k6/1P6/7K b - - 0 1')).toBe('nulle');
  });

  test('il est d’accord avec Stockfish sur chaque coup de la règle du carré et de la case clé', () => {
    ['fi-regle-du-carre', 'fi-case-cle'].forEach((id) => {
      const ex = exercice(id);
      const pos = parseFEN(ex.fen);
      const stockfish = PREUVES.positions[ex.fen].coups;
      legalMoves(pos).forEach((m) => {
        const apres = makeMove(pos, m);
        const exact = verdictKPK(apres);
        const v = valeur(stockfish[uci(m)]);
        // Stockfish voit un gain (≥ 8 pions) ou une nulle (≈ 0) : jamais entre les deux ici
        expect(`${id} ${uci(m)}: ${exact}`).toBe(`${id} ${uci(m)}: ${v >= 800 ? 'gagne' : 'nulle'}`);
      });
    });
  });

  test('les coups attendus de la règle du carré et de la case clé sont exactement les coups gagnants', () => {
    ['fi-regle-du-carre', 'fi-case-cle'].forEach((id) => {
      const ex = exercice(id);
      const pos = parseFEN(ex.fen);
      const gagnants = legalMoves(pos)
        .filter((m) => verdictKPK(makeMove(pos, m)) === 'gagne')
        .map(uci)
        .sort();
      expect(gagnants).toEqual([...ex.attendus].sort());
      // et la position elle-même est gagnée : sinon aucun coup ne le serait
      expect(verdictKPK(pos)).toBe('gagne');
    });
  });
});

describe('F8 · leçon « l’opposition » : le trait décide', () => {
  const steps = () => LESSONS.find((l) => l.id === 'opposition')!.steps;

  test('avec le trait aux noirs, les blancs gagnent : c’est celui qui NE joue PAS qui a l’opposition', () => {
    // les deux premières étapes prétendent que « cette technique gagne » : elles doivent gagner
    expect(parseFEN(steps()[0].fen).turn).toBe('b');
    expect(verdict(steps()[0].fen)).toBe('gagne');
    expect(verdict(steps()[1].fen)).toBe('gagne');
  });

  test('avec le trait aux blancs, la même position est nulle — et la leçon le dit', () => {
    // l'ancienne leçon montrait cette position en promettant de « gagner des finales entières »
    const derniere = steps()[2];
    expect(parseFEN(derniere.fen).turn).toBe('w');
    expect(verdict(derniere.fen)).toBe('nulle');
    expect(derniere.say).toMatch(/nulle/);
  });

  test('la position de l’ancienne leçon, avec les blancs au trait, ne gagnait pas', () => {
    expect(verdict('8/8/8/4k3/8/4K3/4P3/8 w - - 0 1')).toBe('nulle');
    expect(verdict('8/8/8/4k3/8/4K3/4P3/8 b - - 0 1')).toBe('gagne');
  });
});
