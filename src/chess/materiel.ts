/**
 * Matériel capturé et écart de points — ce que montrent chess.com et lichess
 * de part et d'autre de l'échiquier.
 *
 * Tout est **dérivé de la position**, jamais stocké : il n'y a donc rien à
 * synchroniser avec « Annuler », avec la revue ou avec une reprise de partie.
 */
import type { Color, Piece, PieceType, Position } from './engine';

/** Valeur usuelle des pièces, en pions. */
export const POINTS: Record<PieceType, number> = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };

/** Pièces au départ, par camp. */
const INITIAL: Record<Exclude<PieceType, 'K'>, number> = { P: 8, N: 2, B: 2, R: 2, Q: 1 };

/** Ordre d'affichage : les pièces les plus petites d'abord, comme sur chess.com. */
export const ORDRE: Exclude<PieceType, 'K'>[] = ['P', 'N', 'B', 'R', 'Q'];

export interface Bilan {
  /** Pièces **noires** prises par les blancs, dans l'ordre d'affichage. */
  prisesParBlanc: Piece[];
  /** Pièces **blanches** prises par les noirs. */
  prisesParNoir: Piece[];
  /** Avantage matériel des blancs, en pions (négatif : les noirs mènent). */
  ecart: number;
}

const compter = (pos: Position, camp: Color): Record<PieceType, number> => {
  const n: Record<PieceType, number> = { P: 0, N: 0, B: 0, R: 0, Q: 0, K: 0 };
  for (const piece of pos.board) {
    if (!piece) continue;
    const blanc = piece === piece.toUpperCase();
    if ((camp === 'w') === blanc) n[piece.toUpperCase() as PieceType] += 1;
  }
  return n;
};

/**
 * Bilan matériel d'une position.
 *
 * Une promotion complique le décompte : une dame de plus sur l'échiquier ne
 * veut pas dire qu'une dame adverse a été prise, et le pion qui l'a produite
 * n'a pas été capturé non plus. On retranche donc les promotions des pions
 * manquants avant de les compter comme pris.
 */
export function bilanMateriel(pos: Position): Bilan {
  const blanc = compter(pos, 'w');
  const noir = compter(pos, 'b');

  const manquantes = (present: Record<PieceType, number>): Piece[] => {
    let promues = 0;
    for (const t of ['N', 'B', 'R', 'Q'] as const) promues += Math.max(0, present[t] - INITIAL[t]);
    const sortie: PieceType[] = [];
    for (const t of ORDRE) {
      let m = INITIAL[t] - present[t];
      if (t === 'P') m -= promues;
      for (let i = 0; i < Math.max(0, m); i += 1) sortie.push(t);
    }
    return sortie as Piece[];
  };

  // les pièces qui manquent aux noirs ont été prises par les blancs, et inversement
  const prisesParBlanc = manquantes(noir).map((t) => t.toLowerCase() as Piece);
  const prisesParNoir = manquantes(blanc).map((t) => t as Piece);

  const somme = (n: Record<PieceType, number>): number =>
    ORDRE.reduce((total, t) => total + n[t] * POINTS[t], 0);
  return { prisesParBlanc, prisesParNoir, ecart: somme(blanc) - somme(noir) };
}

/**
 * Ce camp dispose-t-il encore de quoi mater, en supposant que l'adversaire l'y aide ?
 *
 * Sert à trancher une partie perdue au temps : la FIDE la déclare nulle si le
 * camp qui a encore du temps ne peut plus mater par aucune suite de coups
 * légaux. Un pion, une tour ou une dame suffisent ; il faut au moins deux
 * pièces mineures sinon (deux cavaliers ne forcent rien, mais peuvent mater si
 * le défenseur se trompe, donc ils comptent). C'est une approximation
 * volontairement prudente : dans le doute, on ne déclare pas la nulle.
 */
export function peutMater(pos: Position, camp: Color): boolean {
  let mineures = 0;
  for (const piece of pos.board) {
    if (!piece || piece.toLowerCase() === 'k') continue;
    const blanc = piece === piece.toUpperCase();
    if ((camp === 'w') !== blanc) continue;
    const type = piece.toUpperCase();
    if (type === 'P' || type === 'R' || type === 'Q') return true;
    mineures += 1;
  }
  return mineures >= 2;
}
