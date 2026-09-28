/**
 * Pratique des finales : jouer une position de finale contre le moteur, avec un
 * objectif précis — mater, ou tenir la nulle.
 *
 * Les leçons montrent la technique sur un coup ; ici il faut la mener jusqu'au
 * bout, contre un adversaire qui défend au mieux. C'est ce que proposent
 * chess.com et lichess sous le nom de « pratique ».
 *
 * Chaque scénario est validé par le moteur (voir les tests) : l'objectif
 * annoncé est bien celui que l'évaluation confirme, et il est atteignable.
 */
import type { Color } from './engine';
import type { Partie } from './partie';

export type Objectif = 'gagner' | 'nulle';

export interface Finale {
  id: string;
  titre: string;
  fen: string;
  /** Camp de l'élève. */
  camp: Color;
  objectif: Objectif;
  /** Ce qu'il faut réaliser, en une phrase. */
  consigne: string;
  /** Le principe à retenir, montré après la partie. */
  principe: string;
  /**
   * Nombre de coups (de l'élève) au bout duquel le scénario est décidé :
   * pour « gagner », passé ce nombre c'est raté ; pour « nulle », l'avoir
   * atteint sans perdre suffit.
   */
  coupsMax: number;
  niveau: 1 | 2 | 3;
  /**
   * Ce que dit Stockfish 18 à profondeur 22, du point de vue de l'élève. C'est
   * l'étalon : le moteur maison, fait pour jouer, se trompe sur les finales de
   * forteresse comme Philidor, où le matériel trompe l'évaluation.
   */
  validation: { type: 'mat' | 'cp'; valeur: number };
}

export const FINALES: Finale[] = [
  {
    id: 'mat-dame',
    titre: 'Mater avec la dame',
    fen: '4k3/8/8/8/8/8/8/3QK3 w - - 0 1',
    camp: 'w',
    objectif: 'gagner',
    consigne: 'Mate le roi noir avec ta dame et ton roi. Attention au pat !',
    principe:
      'Enferme le roi adverse sur le bord avec la dame, un cavalier de distance, puis amène ton roi à côté pour donner le mat.',
    coupsMax: 20,
    niveau: 1,
    validation: { type: 'mat', valeur: 8 },
  },
  {
    id: 'mat-tour',
    titre: 'Mater avec la tour',
    fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1',
    camp: 'w',
    objectif: 'gagner',
    consigne: 'Mate le roi noir avec ta tour et ton roi.',
    principe:
      'La tour coupe le roi adverse sur une rangée ; ton roi avance pour prendre l’opposition, puis la tour donne l’échec sur le bord.',
    coupsMax: 30,
    niveau: 1,
    validation: { type: 'mat', valeur: 14 },
  },
  {
    id: 'promouvoir',
    titre: 'Gagner avec un pion d’avance',
    fen: '8/8/8/4k3/8/4K3/4P3/8 b - - 0 1',
    camp: 'w',
    objectif: 'gagner',
    consigne: 'Fais avancer ton pion jusqu’en dame, puis mate. Ton roi doit toujours le précéder.',
    principe:
      'Roi devant le pion, et prendre l’opposition : le roi adverse doit céder le passage, alors le pion promeut.',
    coupsMax: 40,
    niveau: 2,
    validation: { type: 'cp', valeur: 7436 },
  },
  {
    id: 'lucena',
    titre: 'La position de Lucena',
    fen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1',
    camp: 'w',
    objectif: 'gagner',
    consigne: 'Ton pion est en septième rangée mais ton roi est enfermé. Fais promouvoir le pion.',
    principe:
      'Construis un « pont » : la tour se place quatre rangées plus bas pour abriter ton roi des échecs, puis le pion promeut.',
    coupsMax: 30,
    niveau: 3,
    validation: { type: 'cp', valeur: 1145 },
  },
  {
    id: 'philidor',
    titre: 'La défense de Philidor',
    fen: '4k3/8/r7/3PK3/8/8/8/3R4 b - - 0 1',
    camp: 'b',
    objectif: 'nulle',
    consigne: 'Tu défends une finale de tours inférieure. Tiens la nulle en gardant ta tour sur la sixième rangée.',
    principe:
      'Garde la tour sur la sixième rangée pour empêcher le roi adverse d’avancer ; quand le pion atteint la sixième, la tour passe derrière et donne des échecs par derrière.',
    coupsMax: 25,
    niveau: 3,
    validation: { type: 'cp', valeur: -23 },
  },
];

export type IssueFinale = 'reussi' | 'rate' | null;

/**
 * La partie de finale est-elle décidée, et dans quel sens ?
 *
 * `null` tant qu'elle n'est pas jouée jusqu'à un résultat. Le nombre de coups
 * est compté depuis la position de départ du scénario.
 */
export function evaluerFinale(f: Finale, p: Partie): IssueFinale {
  const mesCoups = coupsDeLEleve(f, p);
  if (p.fin) {
    if (f.objectif === 'gagner') return p.fin.resultat === 'win' ? 'reussi' : 'rate';
    return p.fin.resultat === 'loss' ? 'rate' : 'reussi';
  }
  if (mesCoups >= f.coupsMax) return f.objectif === 'nulle' ? 'reussi' : 'rate';
  return null;
}

/** Nombre de coups déjà joués par l'élève dans la partie. */
export function coupsDeLEleve(f: Finale, p: Partie): number {
  // le premier coup est à l'élève si c'est à son camp de jouer au départ
  const departLuiAuTrait = f.fen.split(' ')[1] === f.camp;
  return departLuiAuTrait ? Math.ceil(p.moves.length / 2) : Math.floor(p.moves.length / 2);
}
