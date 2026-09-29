/**
 * Le coup attendu est-il vraiment le seul ?
 *
 * Un problème dont deux coups gagnent aussi bien punit l'élève qui trouve
 * l'autre : `double-att` acceptait cinq dames différentes à quelques dixièmes
 * de pion près, `inter` deux coups aussi rentables l'un que l'autre. Pire, la
 * consigne d'une leçon (« Joue Db8 ») peut cacher que la position se gagne
 * de dix façons, ce qui n'enseigne pas ce que le texte prétend.
 *
 * On interroge le moteur maison à profondeur 7 (`Chercheur.scorer`, sans
 * Stockfish) : parmi tous les coups légaux, combien atteignent l'objectif
 * dans une marge de 60 centièmes de pion du meilleur ? Un seul, celui de la
 * solution — ou la multiplicité est écrite ci-dessous avec sa raison.
 *
 * Pour un mat, l'objectif est le mat le plus rapide : un mat plus lent n'est
 * pas « aussi bon », `isGoodMove` le refuse déjà (tolérance nulle sur les
 * mats), et deux mats à égalité de vitesse comptent pour deux solutions.
 */
import { LESSONS, PUZZLES } from '../content';
import { Chercheur, MAT_LIMITE } from '../brain/recherche';
import { Plateau, deCase, promoDe, versCase } from '../brain/plateau';
import { parseFEN, squareName, type Position } from '../engine';

const PROFONDEUR = 7;
/** Écart au meilleur coup en deçà duquel un coup « atteint aussi l'objectif ». */
const MARGE = 60;

interface Note {
  uci: string;
  score: number;
}

const uciDe = (m: number): string => {
  const promo = promoDe(m);
  return `${squareName(deCase(m))}${squareName(versCase(m))}${promo ? 'nbrq'[promo - 2] : ''}`;
};

/** Les coups à moins de `MARGE` du meilleur, avec leur score, du meilleur au moins bon. */
function notes(pos: Position): Note[] {
  const plateau = new Plateau();
  plateau.charger(pos);
  const chercheur = new Chercheur(17);
  return chercheur
    .scorer(plateau, { profondeur: PROFONDEUR, qmax: 8 }, MARGE)
    .map((n) => ({ uci: uciDe(n.coup), score: n.score }))
    .sort((a, b) => b.score - a.score);
}

/** Les coups qui atteignent l'objectif : à égalité avec le meilleur pour un mat, dans la marge sinon. */
function solutions(pos: Position): string[] {
  const n = notes(pos);
  if (n.length === 0) return [];
  const meilleur = n[0].score;
  if (meilleur >= MAT_LIMITE) return n.filter((x) => x.score >= meilleur).map((x) => x.uci);
  return n.map((x) => x.uci);
}

const uciLigne = (m: readonly string[]): string => `${m[0]}${m[1]}${m[2] ? m[2].toLowerCase() : ''}`;

/**
 * Les multiplicités assumées, avec leur raison. Toute autre position doit
 * n'avoir qu'une solution.
 */
const PROBLEMES_A_SOLUTIONS_MULTIPLES: Record<string, string> = {
  'esc-b':
    'l’escalier de deux tours se joue de trois façons à vitesse égale — Ta7 ou Tb7 (une tour coupe la 7e rangée) ' +
    'et Tg1 (elle coupe la colonne g) — chacune suivie d’un mat à la rangée voisine. Le problème enseigne le ' +
    'principe, pas un coup : `cerveau.test.ts` accepte déjà tout mat aussi rapide.',
  inter:
    'la tour noire en b2 reste en prise tant que le roi noir ne peut pas la sauver : Rxb2 (le roi) et Te1+ ' +
    'puis Txe2 gagnent tous deux la tour. Le problème enseigne « prendre ce qui est gratuit » ; les deux le font.',
};

describe('problèmes : une seule solution', () => {
  test.each(PUZZLES.map((p) => [p.id, p] as const))('%s', (id, puzzle) => {
    const trouvees = solutions(parseFEN(puzzle.fen));
    const attendu = uciLigne(puzzle.line[0]);
    if (PROBLEMES_A_SOLUTIONS_MULTIPLES[id]) {
      // la multiplicité est documentée : la solution officielle en fait partie
      expect(trouvees).toContain(attendu);
      expect(trouvees.length).toBeGreaterThan(1);
    } else {
      expect(trouvees).toEqual([attendu]);
    }
  });

  test('chaque multiplicité documentée correspond à un problème qui existe', () => {
    Object.keys(PROBLEMES_A_SOLUTIONS_MULTIPLES).forEach((id) =>
      expect(PUZZLES.some((p) => p.id === id)).toBe(true),
    );
  });
});

/**
 * Les tâches de leçon.
 *
 * Deux sortes de consignes. Certaines *dictent* le coup — « Amène ta tour en
 * a8 », « Joue Db8 » — et l'élève n'a rien à trouver : le texte nomme la case
 * d'arrivée et le coup est signalé par une flèche. Les autres demandent de
 * *trouver* un coup, et celui-là doit être le seul à faire ce qu'on annonce.
 */
const dicte = (say: string, vers: string): boolean => new RegExp(`(^|[^a-h0-9])${vers}([^a-h0-9]|$)`).test(say);

/** Tâches qui demandent de trouver un coup, avec la raison quand plusieurs conviennent. */
const TACHES_A_TROUVER_AVEC_PLUSIEURS_COUPS: Record<string, string> = {};

const taches = LESSONS.flatMap((l) =>
  l.steps.flatMap((s, i) => (s.task ? [{ id: `${l.id}:${i}`, step: s, lecon: l }] : [])),
);

describe('leçons : le coup demandé est dicté, ou il est le seul à convenir', () => {
  test('il y a bien des tâches à vérifier', () => {
    expect(taches.length).toBeGreaterThan(20);
  });

  test.each(taches.map((t) => [t.id, t] as const))('%s', (id, t) => {
    const { task, fen, say } = t.step;
    const attendu = `${task!.from}${task!.to}${task!.promotion ? task!.promotion.toLowerCase() : ''}`;
    // une consigne qui nomme la case d'arrivée dicte le coup : il n'y a rien à
    // trouver, et la multiplicité est écrite dans le texte lui-même
    if (dicte(say, task!.to)) return;
    const trouvees = solutions(parseFEN(fen));
    if (TACHES_A_TROUVER_AVEC_PLUSIEURS_COUPS[id]) {
      expect(trouvees).toContain(attendu);
    } else {
      expect(trouvees).toEqual([attendu]);
    }
  });

  test('une tâche dictée nomme vraiment sa case d’arrivée', () => {
    // garde-fou contre une expression régulière trop généreuse : « d8 » ne doit
    // pas se lire dans « d80 » ni dans un mot
    expect(dicte('Prends la tour en d8 !', 'd8')).toBe(true);
    expect(dicte('Joue Db8 : mat', 'b8')).toBe(true);
    expect(dicte('Trouve la case qui attaque le roi', 'f7')).toBe(false);
    expect(dicte('La case d80 n’existe pas', 'd8')).toBe(false);
  });
});
