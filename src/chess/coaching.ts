/**
 * Retour immédiat sur un coup d'élève.
 *
 * Deux choses distinctes s'y trouvent :
 *
 * - le **verdict**, qui compare le coup joué au meilleur coup disponible et
 *   se lit comme une note (brillant, bon, imprécision, erreur, gaffe). Il se
 *   mesure en **probabilité de gain perdue**, pas en centipions : voir
 *   `probaGain` et `SEUILS` ;
 * - le **calcul matériel**, qui explique en points ce que le coup gagne ou
 *   perd, parce qu'un débutant comprend « tu perds un cavalier pour un pion,
 *   −2 points » bien mieux qu'un score en centièmes de pion.
 *
 * Le verdict vient du moteur, le calcul matériel du plateau : ils peuvent se
 * contredire, et c'est voulu. Un sacrifice correct perd du matériel tout en
 * étant le meilleur coup — c'est précisément ce qu'on appelle brillant.
 */
import { MATE_SCORE, material, stableMaterial } from './ai';
import {
  attackers,
  colorOf,
  fileOf,
  rankOf,
  sq,
  findKing,
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

/**
 * Coefficient de la courbe de probabilité de gain de lichess.
 *
 * C'est un ajustement logistique sur des millions de parties : à +100 cp le
 * camp qui a l'avantage gagne environ 59 % du temps, à +300 cp environ 75 %.
 */
const COEF_GAIN = 0.00368208;

/** Au-delà de ±1000 cp la courbe est plate : lichess écrête aussi à cette valeur. */
const CP_MAX_GAIN = 1000;

/**
 * Probabilité de gain, de 0 à 100, d'une évaluation en centipions vue du camp
 * qui la possède (formule de lichess).
 *
 * Pourquoi ne pas juger les coups en centipions ? Parce que trois pions ne
 * pèsent pas la même chose selon la position : les perdre à égalité est une
 * catastrophe (de 50 % à environ 25 % de chances de gagner), les perdre à +10
 * n'y change presque rien (97 % contre 96 %). Un seuil fixe en centipions
 * appelait « gaffe » le second cas et se taisait sur des fautes réelles dans
 * une position serrée.
 *
 * Un mat (score de valeur absolue au moins `SEUIL_MAT`) vaut 100 ou 0.
 */
export function probaGain(cp: number): number {
  if (cp >= SEUIL_MAT) return 100;
  if (cp <= -SEUIL_MAT) return 0;
  const c = Math.max(-CP_MAX_GAIN, Math.min(CP_MAX_GAIN, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-COEF_GAIN * c)) - 1);
}

/**
 * Probabilité de gain perdue entre le meilleur coup et le coup joué, en
 * points de pourcentage (toujours positive ou nulle).
 */
export const perteDeGain = (meilleur: number, joue: number): number =>
  Math.max(0, probaGain(meilleur) - probaGain(joue));

/**
 * Seuils de perte de probabilité de gain, en points, du meilleur au pire.
 *
 * Ils sont ceux de chess.com : jusqu'à 5 points perdus le coup reste bon, 10
 * en font une imprécision, 20 une erreur, au-delà c'est une gaffe. À égalité
 * cela correspond à peu près à 55, 110 et 240 centipions — proche des anciens
 * seuils fixes (50, 120, 300) là où ils avaient un sens — mais cela s'étire
 * dans les positions déjà tranchées, où l'on peut perdre beaucoup de
 * matériel sans changer l'issue. Chaque limite est incluse dans sa classe.
 */
export const SEUILS: [number, Verdict][] = [
  [5, 'bon'],
  [10, 'imprecision'],
  [20, 'erreur'],
  [Infinity, 'gaffe'],
];

/**
 * Sous ce seuil de probabilité de gain perdue, le coup compte comme « le
 * meilleur ». Il faut être tolérant : entre deux coups presque équivalents un
 * moteur à profondeur 10 hésite sur quelques centipions, et refuser le titre
 * de meilleur coup pour cela rendrait « brillant » introuvable.
 */
const MARGE_MEILLEUR = 2;

/** Un sacrifice « brillant » n'est pas décerné si la position était déjà gagnée à ce point. */
const GAIN_DEJA_GAGNE = 90;
/** … ni si le coup laisse une position clairement moins bonne (sacrifice de désespoir). */
const GAIN_MINI_BRILLANT = 40;

export const TITRES: Record<Verdict, string> = {
  brillant: 'Brillant !',
  bon: 'Bon coup',
  imprecision: 'Imprécision',
  erreur: 'Erreur',
  gaffe: 'Gaffe',
};

/** Point de vue de la phrase : celui qui joue est l'élève (« tu ») ou son adversaire. */
export type Voix = 'joueur' | 'adversaire';

/** Bilan matériel d'un coup, du point de vue de celui qui le joue. */
export interface BilanMateriel {
  /** Points pris à l'adversaire. */
  gagne: number;
  /** Points perdus si l'adversaire peut reprendre tout de suite (un demi-coup). */
  risque: number;
  /**
   * Solde matériel une fois tous les échanges de reprises épuisés, en points
   * (voir `soldeApresEchanges`). C'est lui qui dit si le coup sacrifie quelque
   * chose : `gagne - risque` ignore que l'on peut reprendre à son tour.
   */
  net: number;
  /** Phrase toute faite, ou `null` si le coup ne touche à rien. */
  phrase: string | null;
}

/**
 * Solde matériel d'un coup une fois les reprises jouées, en points entiers du
 * point de vue de celui qui joue.
 *
 * Écossaise, 4.Cxd4 : le cavalier prend un pion (+1), Cxd4 le reprend (−3),
 * Dxd4 reprend à son tour (+3) : solde +1. Ne compter que la première reprise
 * (« ta pièce peut être reprise, −2 ») appelait « sacrifice brillant » le
 * coup le plus ordinaire de l'ouverture — le calcul s'arrêtait au milieu de
 * l'échange, comme un débutant qui oublie de reprendre.
 *
 * On s'appuie sur `stableMaterial` (recherche de prises seulement, avec
 * possibilité de s'arrêter) : c'est la mesure qu'un joueur fait de tête avant
 * de se lancer dans un échange. Ses valeurs sont en centipions, avec un fou à
 * 330 et un cavalier à 320 ; l'arrondi ramène l'ensemble aux points
 * d'enseignement (pion 1, pièce mineure 3, tour 5, dame 9).
 */
export function soldeApresEchanges(pos: Position, move: Move): number {
  const piece = pos.board[move.from];
  if (!piece) throw new Error(`aucune pièce en ${squareName(move.from)}`);
  const moi = colorOf(piece) as Color;
  const stable = stableMaterial(makeMove(pos, move));
  const signeMoi = moi === 'w' ? 1 : -1;
  // un mat annoncé n'est pas du matériel : le solde vaut ce que le coup prend
  if (Math.abs(stable) >= MATE_SCORE / 2) {
    const pris = move.enPassant ? 'P' : move.captured ? typeOf(move.captured) : null;
    return stable * signeMoi > 0 ? (pris ? POINTS[pris] : 0) : -POINTS.Q;
  }
  return Math.round((signeMoi * (stable - material(pos))) / 100);
}

/** « 2 points », « 1 point » : le pluriel commence à deux. */
const pts = (n: number): string => `point${Math.abs(n) >= 2 ? 's' : ''}`;

/**
 * Ce que le coup gagne et ce qu'il expose.
 *
 * `gagne` et `risque` disent ce qui se passe au premier demi-coup ; `net` dit
 * ce qu'il reste une fois l'échange terminé. Les deux comptes coexistent parce
 * qu'ils ne servent pas à la même chose : le premier explique (« ta pièce peut
 * être reprise »), le second juge (« ce coup coûte vraiment quelque chose »).
 */
export function bilanMateriel(pos: Position, move: Move, voix: Voix = 'joueur'): BilanMateriel {
  const piece = pos.board[move.from];
  if (!piece) throw new Error(`aucune pièce en ${squareName(move.from)}`);

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
  // le solde final n'a d'intérêt que si quelque chose peut être repris
  const net = reprenable ? soldeApresEchanges(pos, move) : gagne;

  const toi = voix === 'joueur';
  const phrase = ((): string | null => {
    if (pris && reprenable) {
      if (net >= 0) {
        const bilan = net === 0 ? 'équilibré' : `à ${signe(net)} ${pts(net)}${toi ? '' : ' pour lui'}`;
        return toi
          ? `Tu prends un ${NOMS[pris]} (+${gagne}) : si l'adversaire reprend, tu reprends à ton tour, et l'échange est ${bilan}.`
          : `L'adversaire prend un ${NOMS[pris]} (+${gagne}) : si tu reprends, il reprend à son tour, et l'échange est ${bilan}.`;
      }
      return toi
        ? `Tu prends un ${NOMS[pris]} (+${gagne}) mais ta pièce peut être reprise (−${risque}) → ${signe(net)} ${pts(net)}.`
        : `L'adversaire prend un ${NOMS[pris]} (+${gagne}) mais sa pièce peut être reprise (−${risque}) → ${signe(net)} ${pts(net)} pour lui.`;
    }
    if (pris) {
      return toi
        ? `Tu prends un ${NOMS[pris]} et rien ne peut reprendre → +${gagne}.`
        : `L'adversaire prend un ${NOMS[pris]} et rien ne peut reprendre → +${gagne} pour lui.`;
    }
    // une pièce attaquée mais suffisamment défendue (solde ≥ 0) n'est pas un danger
    if (reprenable && valeurExposee > 0 && net < 0) {
      return toi
        ? `Attention : en ${squareName(move.to)} ta pièce est attaquée (${signe(net)}).`
        : `En ${squareName(move.to)} sa pièce est attaquée (${signe(net)} pour lui).`;
    }
    return null;
  })();

  return { gagne, risque, net, phrase };
}

/** Écrit un solde signé avec le vrai signe moins, pas un trait d'union. */
const signe = (n: number): string => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

/**
 * Le coup abandonne-t-il du matériel ? Sert à reconnaître un sacrifice.
 *
 * Le solde est celui d'après les échanges (`net`), pas celui du premier
 * demi-coup : un échange courant n'est pas un sacrifice.
 */
const estSacrifice = (bilan: BilanMateriel): boolean => bilan.net <= -2;

export interface Feedback {
  verdict: Verdict;
  /** Écart au meilleur coup, en centièmes de pion. */
  perte: number;
  /**
   * Probabilité de gain perdue, en points de pourcentage (voir `probaGain`).
   * C'est cette valeur, et non `perte`, qui décide du verdict.
   */
  perteGain: number;
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
  /**
   * Qui parle : l'élève (« tu ») ou son adversaire (« l'adversaire »). La
   * revue de partie note les deux camps ; dire « tu gaffes » d'un coup adverse
   * serait faux.
   */
  voix?: Voix;
}

/** Du moins grave au plus grave, pour remonter un verdict sans jamais le baisser. */
const GRAVITE: Verdict[] = ['brillant', 'bon', 'imprecision', 'erreur', 'gaffe'];
const auMoins = (v: Verdict, plancher: Verdict): Verdict =>
  GRAVITE.indexOf(v) >= GRAVITE.indexOf(plancher) ? v : plancher;

/**
 * Note un coup et rédige l'explication.
 *
 * Le verdict vient de la probabilité de gain perdue (`SEUILS`). Deux
 * exceptions le corrigent, parce qu'un mat ne se laisse pas mesurer en
 * probabilité (100 % contre 97 % à +10) : laisser échapper un mat est au moins
 * une imprécision, en offrir un à l'adversaire au moins une erreur.
 *
 * « Brillant » est réservé aux coups qui sont à la fois les meilleurs et
 * coûteux en matériel *après les échanges* : sans cette double condition,
 * chaque bon coup ordinaire s'appellerait brillant et le mot ne voudrait plus
 * rien dire. Deux garde-fous en plus, tirés de chess.com : pas de brillant si
 * la position était déjà gagnée (sacrifier alors ne prouve rien), ni si le coup
 * laisse une position mauvaise (un sacrifice qui ne marche pas n'est pas
 * brillant, seulement le moindre mal).
 */
export function noterCoup({ pos, move, meilleur, joue, voix = 'joueur' }: FeedbackEntree): Feedback {
  const perte = Math.max(0, meilleur - joue);
  const perteGain = perteDeGain(meilleur, joue);
  const bilan = bilanMateriel(pos, move, voix);

  const estMeilleur = perteGain <= MARGE_MEILLEUR && perte <= 50;
  const dejaGagne = probaGain(meilleur) > GAIN_DEJA_GAGNE && meilleur < SEUIL_MAT;
  const sacrificeReussi =
    estMeilleur && estSacrifice(bilan) && !dejaGagne && probaGain(joue) >= GAIN_MINI_BRILLANT;

  let verdict: Verdict = sacrificeReussi
    ? 'brillant'
    : estMeilleur
      ? 'bon'
      : SEUILS.find(([limite]) => perteGain <= limite)![1];
  if (joue <= -SEUIL_MAT && meilleur > -SEUIL_MAT) verdict = auMoins(verdict, 'erreur');
  else if (meilleur >= SEUIL_MAT && joue < SEUIL_MAT) verdict = auMoins(verdict, 'imprecision');

  // « une pièce reste en prise » n'est vrai que si une pièce est réellement
  // attaquée et laissée sans défense ; une fourchette ou une menace de mat ne
  // laisse aucune pièce en prise au sens strict
  const camp = colorOf(pos.board[move.from]) as Color;
  const enPrise = piecesEnPrise(makeMove(pos, move), camp).length > 0;

  const texte = redigerTexte(verdict, perte, bilan, meilleur, joue, enPrise, voix);
  return {
    verdict,
    perte,
    perteGain,
    titre: TITRES[verdict],
    texte,
    bilan,
    evalMeilleur: meilleur,
    evalJoue: joue,
  };
}

export function redigerTexte(
  verdict: Verdict,
  perte: number,
  bilan: BilanMateriel,
  meilleur: number,
  joue: number,
  enPrise = true,
  voix: Voix = 'joueur',
): string {
  const toi = voix === 'joueur';
  // un mat gagné ou concédé ne se raconte pas en points
  if (perte >= SEUIL_MAT) {
    if (joue <= -SEUIL_MAT) {
      return toi ? 'Ce coup permet à l’adversaire de mater.' : 'Ce coup te permet de mater.';
    }
    if (meilleur >= SEUIL_MAT) {
      return toi
        ? 'Il y avait un mat à jouer, et ce coup le laisse échapper.'
        : 'Il y avait un mat à jouer pour l’adversaire, et ce coup le laisse échapper.';
    }
    return 'Ce coup change l’issue de la partie.';
  }
  const valeur = perte / 100;
  const pions = valeur.toFixed(1).replace('.', ',');
  const cout = `${pions} ${pts(valeur)}`;
  const suite = bilan.phrase ? ` ${bilan.phrase}` : '';
  // ce que le coup laisse à l'adversaire, quand aucune capture ne l'explique
  const menace = (fort: string) =>
    toi
      ? `Ce coup laisse à l'adversaire une réponse ${fort} : cherche ce qu'il menace.`
      : `Ce coup te laisse une réponse ${fort} : cherche ce qui est possible.`;
  switch (verdict) {
    case 'brillant':
      return toi
        ? `Tu donnes du matériel et c'est pourtant le meilleur coup.${suite}`
        : `L'adversaire donne du matériel et c'est pourtant le meilleur coup.${suite}`;
    case 'bon':
      // « bon » couvre jusqu'à 5 points de probabilité de gain perdus : à
      // 50 centipions du meilleur coup, dire « c'est le meilleur coup »
      // serait faux
      return bilan.phrase ?? (perte <= 10 ? "C'est le meilleur coup de la position." : 'Bon coup.');
    case 'imprecision':
      return toi
        ? `Jouable, mais il y avait mieux : tu laisses filer ${cout}.${suite}`
        : `Jouable, mais il y avait mieux : l'adversaire laisse filer ${cout}.${suite}`;
    case 'erreur':
      return `Ce coup coûte ${cout}. ${
        bilan.phrase ??
        (enPrise
          ? toi
            ? 'Regarde ce que l’adversaire peut prendre.'
            : 'Regarde ce que tu peux prendre.'
          : menace('forte'))
      }`.trim();
    default:
      return `Ce coup coûte ${cout}. ${
        bilan.phrase ??
        (enPrise
          ? toi
            ? 'Une pièce reste en prise après ce coup.'
            : 'Une pièce reste en prise après ce coup : profites-en.'
          : menace('très forte'))
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

/** Nom français d'une pièce, avec son article : « le pion », « la tour ». */
const NOM_PIECE: Record<string, string> = {
  K: 'le roi',
  Q: 'la dame',
  R: 'la tour',
  B: 'le fou',
  N: 'le cavalier',
  P: 'le pion',
};

/** « la tour a1 » — la pièce occupant cette case, nommée et située. */
export function nommerPiece(pos: Position, square: number): string {
  const p = pos.board[square];
  if (!p) return squareName(square);
  return `${NOM_PIECE[p.toUpperCase()]} ${squareName(square)}`;
}

/** « le pion d3 », « le pion d3 et la tour e1 », « le pion d3, … et … ». */
function enumerer(pos: Position, cases: number[]): string {
  const noms = cases.map((s) => nommerPiece(pos, s));
  if (noms.length <= 1) return noms[0] ?? '';
  return `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`;
}

/**
 * Pourquoi ce coup est-il refusé ?
 *
 * Un refus muet est la première cause de « c'est un bug » : l'élève voit une
 * capture évidente, l'application ne la joue pas, et rien ne l'éclaire. Pire
 * qu'un refus muet, un refus invérifiable : « cette pièce est défendue » sans
 * dire par quoi ne se contrôle pas sur l'échiquier, et l'élève a raison de ne
 * pas le croire. On nomme donc toujours la pièce responsable.
 *
 * Rend `null` quand il n'y a rien à dire — la pièce ne se déplace tout
 * simplement pas ainsi, ou le coup est légal.
 */
export function expliquerRefus(pos: Position, from: number, to: number): string | null {
  const pseudo = pseudoMovesFrom(pos, from).find((m) => m.to === to);
  if (!pseudo) return null;
  const camp = pos.turn;
  const adverse: Color = camp === 'w' ? 'b' : 'w';
  const apres = makeMove(pos, pseudo);
  if (!inCheck(apres, camp)) return null;

  const piece = pos.board[from];
  if (!piece) return null;
  const arrivee = squareName(to);

  if (typeOf(piece) === 'K') {
    // Ce sont les pièces qui tiennent la case d'arrivée *après* le coup qui
    // l'interdisent : une tour peut n'y arriver qu'une fois le roi parti de
    // sa case actuelle, et le pion pris peut l'être justement parce qu'un
    // autre pion le défend.
    const gardiens = attackers(apres, to, adverse);
    const qui = enumerer(apres, gardiens);
    if (pos.board[to] || pseudo.enPassant) {
      return gardiens.length > 0
        ? `Prise impossible en ${arrivee} : cette pièce est défendue par ${qui}.`
        : `Ton roi ne peut pas aller en ${arrivee}.`;
    }
    return gardiens.length > 0
      ? `Ton roi ne peut pas aller en ${arrivee} : ${qui} contrôle cette case.`
      : `Ton roi serait encore en échec en ${arrivee}.`;
  }

  if (inCheck(pos, camp)) {
    const auteurs = attackers(pos, findKing(pos, camp), adverse);
    const qui = enumerer(pos, auteurs);
    return qui
      ? `Ce coup ne pare pas l’échec de ${qui}.`
      : 'Ce coup ne pare pas l’échec.';
  }

  // Le roi est en échec seulement *après* le coup : la pièce était clouée, et
  // c'est l'attaquant nouvellement démasqué qui le dit.
  const decouvreurs = attackers(apres, findKing(apres, camp), adverse);
  const qui = enumerer(apres, decouvreurs);
  return qui
    ? `Cette pièce est clouée : la bouger découvrirait ton roi sur ${qui}.`
    : 'Cette pièce est clouée : la bouger découvrirait ton roi.';
}

/**
 * Pourquoi ne peut-on pas roquer ?
 *
 * Le roque est le coup dont l'interdiction paraît le plus arbitraire à un
 * débutant : quatre conditions indépendantes, et rien à l'écran ne dit
 * laquelle manque. On les teste dans l'ordre où un joueur les vérifie —
 * droit perdu, roi en échec, pièces entre le roi et la tour, cases traversées
 * attaquées — et on nomme ce qui gêne.
 *
 * Reconnaît les deux gestes : le roi vers sa case d'arrivée (deux cases), ou le
 * roi vers sa propre tour. Rend `null` si le geste n'est pas une tentative de
 * roque, ou si le roque est en fait légal.
 */
export function expliquerRoque(pos: Position, from: number, to: number): string | null {
  const piece = pos.board[from];
  if (!piece || typeOf(piece) !== 'K' || colorOf(piece) !== pos.turn) return null;
  const camp = pos.turn;
  const rang = camp === 'w' ? 0 : 7;
  if (from !== sq(4, rang)) return null;

  const cible = pos.board[to];
  const versTour = cible && typeOf(cible) === 'R' && colorOf(cible) === camp && rankOf(to) === rang;
  const versArrivee = rankOf(to) === rang && Math.abs(fileOf(to) - 4) === 2;
  if (!versTour && !versArrivee) return null;
  if (versTour && fileOf(to) !== 0 && fileOf(to) !== 7) return null;

  const petit = fileOf(to) > 4;
  const droit = camp === 'w' ? (petit ? pos.castling.K : pos.castling.Q) : petit ? pos.castling.k : pos.castling.q;
  const adverse: Color = camp === 'w' ? 'b' : 'w';
  const cote = petit ? 'petit roque' : 'grand roque';

  if (!droit) {
    return `Tu ne peux plus faire le ${cote} : le roi ou la tour de ce côté a déjà bougé.`;
  }
  if (inCheck(pos, camp)) return 'Tu ne peux pas roquer : ton roi est en échec.';

  // pièces entre le roi (colonne e) et la tour (colonne h ou a)
  const entre = petit ? [5, 6] : [3, 2, 1];
  const gene = entre.map((f) => sq(f, rang)).find((c) => pos.board[c]);
  if (gene !== undefined) {
    return `Tu ne peux pas roquer : ${nommerPiece(pos, gene)} est entre ton roi et ta tour.`;
  }

  // cases que le roi traverse, puis celle où il arrive (la case b n'est pas traversée)
  const traversees = petit ? [5, 6] : [3, 2];
  for (const f of traversees) {
    const c = sq(f, rang);
    const gardiens = attackers(pos, c, adverse);
    if (gardiens.length > 0) {
      const role = f === traversees[traversees.length - 1] ? 'arriverait' : 'traverserait';
      return `Tu ne peux pas roquer : ton roi ${role} en ${squareName(c)}, contrôlée par ${enumerer(pos, gardiens)}.`;
    }
  }
  return null;
}
