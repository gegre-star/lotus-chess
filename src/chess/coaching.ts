/**
 * Retour immédiat sur un coup d'élève.
 *
 * Deux choses distinctes s'y trouvent :
 *
 * - le **verdict**, qui compare le coup joué au meilleur coup disponible et
 *   se lit comme une note (brillant, bon, imprécision, erreur, gaffe) ;
 * - le **calcul matériel**, qui explique en points ce que le coup gagne ou
 *   perd, parce qu'un débutant comprend « tu perds un cavalier pour un pion,
 *   −2 points » bien mieux qu'un score en centièmes de pion.
 *
 * Le verdict vient du moteur, le calcul matériel du plateau : ils peuvent se
 * contredire, et c'est voulu. Un sacrifice correct perd du matériel tout en
 * étant le meilleur coup — c'est précisément ce qu'on appelle brillant.
 */
import {
  colorOf,
  inCheck,
  isAttacked,
  legalMoves,
  makeMove,
  pseudoMovesFrom,
  squareName,
  type Color,
  type Move,
  type PieceType,
  type Position,
} from './engine';

/** Valeur d'enseignement des pièces, en points. */
export const POINTS: Record<PieceType, number> = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };

/** Nom courant des pièces, pour écrire des phrases lisibles. */
export const NOMS: Record<PieceType, string> = {
  P: 'pion',
  N: 'cavalier',
  B: 'fou',
  R: 'tour',
  Q: 'dame',
  K: 'roi',
};

const typeOf = (p: string): PieceType => p.toUpperCase() as PieceType;

export type Verdict = 'brillant' | 'bon' | 'imprecision' | 'erreur' | 'gaffe';

/** Seuils de perte, en centièmes de pion, du meilleur au pire. */
const SEUILS: [number, Verdict][] = [
  [50, 'bon'],
  [120, 'imprecision'],
  [300, 'erreur'],
  [Infinity, 'gaffe'],
];

export const TITRES: Record<Verdict, string> = {
  brillant: 'Brillant !',
  bon: 'Bon coup',
  imprecision: 'Imprécision',
  erreur: 'Erreur',
  gaffe: 'Gaffe',
};

/** Bilan matériel d'un coup, du point de vue de celui qui le joue. */
export interface BilanMateriel {
  /** Points pris à l'adversaire. */
  gagne: number;
  /** Points perdus si l'adversaire peut reprendre. */
  risque: number;
  /** `gagne - risque`. */
  net: number;
  /** Phrase toute faite, ou `null` si le coup ne touche à rien. */
  phrase: string | null;
}

/**
 * Ce que le coup gagne et ce qu'il expose.
 *
 * On ne regarde qu'un demi-coup de reprise : c'est la faute que commettent
 * réellement les débutants, et pousser plus loin reviendrait à refaire le
 * travail du moteur sans sa précision.
 */
export function bilanMateriel(pos: Position, move: Move): BilanMateriel {
  const piece = pos.board[move.from];
  if (!piece) throw new Error(`aucune pièce en ${squareName(move.from)}`);
  const moi = colorOf(piece) as Color;
  const adverse: Color = moi === 'w' ? 'b' : 'w';

  const pris = move.enPassant ? 'P' : move.captured ? typeOf(move.captured) : null;
  const gagne = pris ? POINTS[pris] : 0;

  const apres = makeMove(pos, move);
  const arrivee = apres.board[move.to];
  const valeurExposee = arrivee ? POINTS[typeOf(arrivee)] : 0;
  // on cherche une reprise réellement jouable, pas une simple attaque
  // géométrique : sur un mat l'adversaire n'a aucun coup, et un défenseur
  // cloué ne défend rien. Annoncer « ta pièce peut être reprise » après un
  // mat serait faux, et sur le coup qui gagne la partie.
  const reprenable = legalMoves(apres).some((m) => m.to === move.to);
  const risque = reprenable ? valeurExposee : 0;
  const net = gagne - risque;

  let phrase: string | null = null;
  if (pris && reprenable) {
    phrase =
      `Tu prends un ${NOMS[pris]} (+${gagne}) mais ta pièce peut être reprise ` +
      `(−${risque}) → ${signe(net)} point${Math.abs(net) > 1 ? 's' : ''}.`;
  } else if (pris) {
    phrase = `Tu prends un ${NOMS[pris]} et rien ne peut reprendre → +${gagne}.`;
  } else if (reprenable && valeurExposee > 0) {
    phrase = `Attention : en ${squareName(move.to)} ta pièce est attaquée (−${risque}).`;
  }

  return { gagne, risque, net, phrase };
}

/** Écrit un solde signé avec le vrai signe moins, pas un trait d'union. */
const signe = (n: number): string => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

/** Le coup abandonne-t-il du matériel ? Sert à reconnaître un sacrifice. */
const estSacrifice = (bilan: BilanMateriel): boolean => bilan.net <= -2;

export interface Feedback {
  verdict: Verdict;
  /** Écart au meilleur coup, en centièmes de pion. */
  perte: number;
  titre: string;
  texte: string;
  bilan: BilanMateriel;
  /** Évaluation du meilleur coup, telle que reçue. */
  evalMeilleur: number;
  /** Évaluation du coup joué, même convention. */
  evalJoue: number;
}

/**
 * Au-delà de ce score, l'évaluation ne décrit plus du matériel mais un mat.
 *
 * Les scores de mat valent environ 100 000 : les soustraire donne des écarts
 * comme « 989 pions », qui ne veulent rien dire. Il faut alors parler de mat,
 * pas de points.
 */
export const SEUIL_MAT = 5000;

/** Perte exprimée en pions, ou `null` quand c'est un mat qui se joue. */
export const perteEnPions = (perte: number): number | null =>
  perte >= SEUIL_MAT ? null : perte / 100;

export interface FeedbackEntree {
  pos: Position;
  move: Move;
  /** Évaluation du meilleur coup, en centièmes de pion, camp au trait. */
  meilleur: number;
  /** Évaluation du coup joué, même convention. */
  joue: number;
}

/**
 * Note un coup et rédige l'explication.
 *
 * « Brillant » est réservé aux coups qui sont à la fois les meilleurs et
 * coûteux en matériel : sans cette double condition, chaque bon coup ordinaire
 * s'appellerait brillant et le mot ne voudrait plus rien dire.
 */
export function noterCoup({ pos, move, meilleur, joue }: FeedbackEntree): Feedback {
  const perte = Math.max(0, meilleur - joue);
  const bilan = bilanMateriel(pos, move);
  const estMeilleur = perte <= 10;
  const verdict: Verdict =
    estMeilleur && estSacrifice(bilan)
      ? 'brillant'
      : estMeilleur
        ? 'bon'
        : SEUILS.find(([limite]) => perte <= limite)![1];

  const texte = redigerTexte(verdict, perte, bilan, meilleur, joue);
  return {
    verdict,
    perte,
    titre: TITRES[verdict],
    texte,
    bilan,
    evalMeilleur: meilleur,
    evalJoue: joue,
  };
}

function redigerTexte(
  verdict: Verdict,
  perte: number,
  bilan: BilanMateriel,
  meilleur: number,
  joue: number,
): string {
  // un mat gagné ou concédé ne se raconte pas en points
  if (perte >= SEUIL_MAT) {
    if (joue <= -SEUIL_MAT) return 'Ce coup permet à l’adversaire de mater.';
    if (meilleur >= SEUIL_MAT) return 'Il y avait un mat à jouer, et ce coup le laisse échapper.';
    return 'Ce coup change l’issue de la partie.';
  }
  const pions = (perte / 100).toFixed(1).replace('.', ',');
  switch (verdict) {
    case 'brillant':
      return `Tu donnes du matériel et c'est pourtant le meilleur coup. ${bilan.phrase ?? ''}`.trim();
    case 'bon':
      return bilan.phrase ?? "C'est le meilleur coup de la position.";
    case 'imprecision':
      return `Jouable, mais il y avait mieux : tu laisses filer ${pions} point. ${
        bilan.phrase ?? ''
      }`.trim();
    case 'erreur':
      return `Ce coup coûte ${pions} points. ${bilan.phrase ?? 'Regarde ce que l’adversaire peut prendre.'}`.trim();
    default:
      return `Ce coup coûte ${pions} points. ${
        bilan.phrase ?? 'Une pièce reste en prise après ce coup.'
      }`.trim();
  }
}

/**
 * Cases occupées par une pièce du camp donné qui est attaquée et non défendue.
 * C'est le surlignage du premier niveau d'indice.
 */
export function piecesEnPrise(pos: Position, camp: Color): string[] {
  const adverse: Color = camp === 'w' ? 'b' : 'w';
  const cases: string[] = [];
  for (let s = 0; s < 64; s += 1) {
    const p = pos.board[s];
    if (!p || colorOf(p) !== camp || typeOf(p) === 'K') continue;
    if (!isAttacked(pos, s, adverse)) continue;
    // défendue si un coup du camp peut revenir sur cette case après capture
    const sansPiece: Position = { ...pos, board: pos.board.slice(), turn: camp };
    sansPiece.board[s] = null;
    const defendue = legalMoves(sansPiece).some((m) => m.to === s);
    if (!defendue) cases.push(squareName(s));
  }
  return cases;
}

/**
 * Pourquoi ce coup est-il refusé ?
 *
 * Un refus muet est la première cause de « c'est un bug » : l'élève voit une
 * capture évidente, l'application ne la joue pas, et rien ne l'éclaire. Les
 * trois raisons ci-dessous couvrent la quasi-totalité des cas réels.
 *
 * Rend `null` quand il n'y a rien à dire — la pièce ne se déplace tout
 * simplement pas ainsi, ou le coup est légal.
 */
export function expliquerRefus(pos: Position, from: number, to: number): string | null {
  const pseudo = pseudoMovesFrom(pos, from).find((m) => m.to === to);
  if (!pseudo) return null;
  const camp = pos.turn;
  if (!inCheck(makeMove(pos, pseudo), camp)) return null;

  const piece = pos.board[from];
  if (!piece) return null;
  const estRoi = typeOf(piece) === 'K';
  const capture = Boolean(pos.board[to]) || Boolean(pseudo.enPassant);

  if (estRoi && capture) {
    return `En ${squareName(to)} la pièce est défendue : ton roi y resterait en échec.`;
  }
  if (estRoi) {
    return `En ${squareName(to)} ton roi serait encore en échec.`;
  }
  if (inCheck(pos, camp)) {
    return 'Ce coup ne pare pas l’échec.';
  }
  return 'Cette pièce est clouée : la bouger découvrirait ton roi.';
}
