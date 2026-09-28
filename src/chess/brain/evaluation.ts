/**
 * Évaluation statique d'une position.
 *
 * Le moteur d'origine ne comptait que le matériel et des tables pour les
 * pions et les cavaliers. Un fou, une tour, une dame ou un roi valaient la
 * même chose sur n'importe quelle case : sans rien pour les guider, à
 * profondeur faible tous les coups tranquilles se valaient, et le choix se
 * faisait au hasard — d'où des pièces qui allaient et venaient.
 *
 * Ici, chaque pièce a une valeur qui dépend de sa case, et ces valeurs
 * changent entre le milieu de jeu et la finale (roi à l'abri puis roi actif),
 * avec une interpolation selon le matériel restant. S'y ajoutent les
 * éléments qu'un joueur regarde d'instinct : la paire de fous, les tours sur
 * colonnes ouvertes, les pions passés, doublés ou isolés, la mobilité, l'abri
 * du roi, et de quoi savoir mater en finale.
 *
 * Score en centièmes de pion, du point de vue du camp **au trait**.
 */
import { B, CAVALIER, K, N, P, Plateau, Q, R, RAYONS, ROI } from './plateau';

/** Tables de valeur des cases, du point de vue des blancs, rangée 8 en haut. */
const T_PION = [
  0, 0, 0, 0, 0, 0, 0, 0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5, 5, 10, 25, 25, 10, 5, 5,
  0, 0, 0, 20, 20, 0, 0, 0,
  5, -5, -10, 0, 0, -10, -5, 5,
  5, 10, 10, -20, -20, 10, 10, 5,
  0, 0, 0, 0, 0, 0, 0, 0,
];
const T_CAVALIER = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0, 0, 0, 0, -20, -40,
  -30, 0, 10, 15, 15, 10, 0, -30,
  -30, 5, 15, 20, 20, 15, 5, -30,
  -30, 0, 15, 20, 20, 15, 0, -30,
  -30, 5, 10, 15, 15, 10, 5, -30,
  -40, -20, 0, 5, 5, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50,
];
const T_FOU = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 10, 10, 5, 0, -10,
  -10, 5, 5, 10, 10, 5, 5, -10,
  -10, 0, 10, 10, 10, 10, 0, -10,
  -10, 10, 10, 10, 10, 10, 10, -10,
  -10, 5, 0, 0, 0, 0, 5, -10,
  -20, -10, -10, -10, -10, -10, -10, -20,
];
const T_TOUR = [
  0, 0, 0, 0, 0, 0, 0, 0,
  5, 10, 10, 10, 10, 10, 10, 5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  0, 0, 0, 5, 5, 0, 0, 0,
];
const T_DAME = [
  -20, -10, -10, -5, -5, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 5, 5, 5, 0, -10,
  -5, 0, 5, 5, 5, 5, 0, -5,
  0, 0, 5, 5, 5, 5, 0, -5,
  -10, 5, 5, 5, 5, 5, 0, -10,
  -10, 0, 5, 0, 0, 0, 0, -10,
  -20, -10, -10, -5, -5, -10, -10, -20,
];
const T_ROI_MJ = [
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -10, -20, -20, -20, -20, -20, -20, -10,
  20, 20, 0, 0, 0, 0, 20, 20,
  20, 30, 10, 0, 0, 10, 30, 20,
];
const T_ROI_FIN = [
  -50, -40, -30, -20, -20, -30, -40, -50,
  -30, -20, -10, 0, 0, -10, -20, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -30, 0, 0, 0, 0, -30, -30,
  -50, -30, -30, -30, -30, -30, -30, -50,
];

/** Table par type de pièce (1 pion … 6 roi) : milieu de jeu, finale. */
const MJ: number[][] = [[], T_PION, T_CAVALIER, T_FOU, T_TOUR, T_DAME, T_ROI_MJ];
const FIN: number[][] = [[], T_PION, T_CAVALIER, T_FOU, T_TOUR, T_DAME, T_ROI_FIN];

/** Valeur de base : milieu de jeu, finale. Le roi ne compte pas. */
export const VAL_MJ = [0, 100, 320, 335, 500, 950, 0];
export const VAL_FIN = [0, 115, 300, 315, 520, 940, 0];

const PHASE = [0, 0, 1, 1, 2, 4, 0];
const PHASE_MAX = 24;

/** Bonus de pion passé selon sa rangée (vue de son camp). */
const PASSE_MJ = [0, 5, 10, 20, 35, 60, 100, 0];
const PASSE_FIN = [0, 10, 20, 40, 75, 125, 200, 0];

/** Poids de la mobilité par pièce, en centièmes de pion par case au-delà de la base. */
const MOB_BASE = [0, 0, 4, 5, 6, 0, 0];
const MOB_POIDS_MJ = [0, 0, 4, 3, 2, 0, 0];
const MOB_POIDS_FIN = [0, 0, 4, 4, 4, 0, 0];

const distanceCentre = (s: number): number => {
  const f = s & 7;
  const r = s >> 3;
  return Math.max(3 - f, f - 4) + Math.max(3 - r, r - 4);
};
const distanceRois = (a: number, b: number): number =>
  Math.abs((a & 7) - (b & 7)) + Math.abs((a >> 3) - (b >> 3));

// tampons réutilisés : l'évaluation est appelée des millions de fois
const nbPions = [new Int8Array(8), new Int8Array(8)];
const rangMin = [new Int8Array(8), new Int8Array(8)];
const rangMax = [new Int8Array(8), new Int8Array(8)];

/**
 * Position morte : ni pion, ni tour, ni dame, et au plus un fou ou un cavalier
 * en tout — ou deux fous de même couleur de case, un par camp.
 */
export function materielInsuffisant(p: Plateau): boolean {
  let mineurs = 0;
  let foux = 0;
  let couleurFou = -1;
  let deuxCouleurs = false;
  const cs = p.cases;
  for (let s = 0; s < 64; s += 1) {
    const t = cs[s] & 7;
    if (t === 0 || t === K) continue;
    if (t === P || t === R || t === Q) return false;
    mineurs += 1;
    if (t === B) {
      foux += 1;
      const c = ((s & 7) + (s >> 3)) & 1;
      if (couleurFou >= 0 && c !== couleurFou) deuxCouleurs = true;
      couleurFou = c;
    }
  }
  if (mineurs <= 1) return true;
  return mineurs === 2 && foux === 2 && !deuxCouleurs && (cs.indexOf(B) >= 0 && cs.indexOf(B + 8) >= 0);
}

export function evaluer(p: Plateau): number {
  const cs = p.cases;
  for (let c = 0; c < 2; c += 1) {
    nbPions[c].fill(0);
    rangMin[c].fill(8);
    rangMax[c].fill(-1);
  }
  // première passe : structure de pions, pour les pions passés et isolés
  for (let s = 8; s < 56; s += 1) {
    const c = cs[s];
    if ((c & 7) !== P) continue;
    const camp = c >> 3;
    const f = s & 7;
    const r = s >> 3;
    nbPions[camp][f] += 1;
    if (r < rangMin[camp][f]) rangMin[camp][f] = r;
    if (r > rangMax[camp][f]) rangMax[camp][f] = r;
  }

  let mj = 0;
  let fin = 0;
  let phase = 0;
  let pionsTotal = 0;
  let matBlanc = 0;
  let matNoir = 0;
  const foux = [0, 0];
  let roiB = 0;
  let roiN = 0;

  for (let s = 0; s < 64; s += 1) {
    const c = cs[s];
    if (c === 0) continue;
    const t = c & 7;
    const camp = c >> 3;
    const signe = camp === 0 ? 1 : -1;
    // table lue du point de vue du camp : les noirs sont vus à l'envers
    const idx = camp === 0 ? s ^ 56 : s;
    let vm = VAL_MJ[t] + MJ[t][idx];
    let vf = VAL_FIN[t] + FIN[t][idx];
    phase += PHASE[t];
    if (t === P) pionsTotal += 1;
    if (t !== K && t !== P) {
      if (camp === 0) matBlanc += VAL_MJ[t];
      else matNoir += VAL_MJ[t];
    }
    const f = s & 7;
    const r = s >> 3;

    if (t === P) {
      const rel = camp === 0 ? r : 7 - r;
      const adv = camp ^ 1;
      // passé : aucun pion adverse devant lui, sur sa colonne ni les voisines
      let passe = true;
      for (let g = Math.max(0, f - 1); g <= Math.min(7, f + 1) && passe; g += 1) {
        if (camp === 0 ? rangMax[adv][g] > r : rangMin[adv][g] < r && rangMin[adv][g] < 8) passe = false;
      }
      if (passe) {
        vm += PASSE_MJ[rel];
        vf += PASSE_FIN[rel];
      }
      if (nbPions[camp][f] > 1) {
        vm -= 8;
        vf -= 16;
      }
      const voisin =
        (f > 0 && nbPions[camp][f - 1] > 0) || (f < 7 && nbPions[camp][f + 1] > 0);
      if (!voisin) {
        vm -= 10;
        vf -= 14;
      }
    } else if (t === N) {
      const cib = CAVALIER[s];
      let m = 0;
      for (let i = 0; i < cib.length; i += 1) {
        const v = cs[cib[i]];
        if (v === 0 || (v >> 3) !== camp) m += 1;
      }
      vm += (m - MOB_BASE[N]) * MOB_POIDS_MJ[N];
      vf += (m - MOB_BASE[N]) * MOB_POIDS_FIN[N];
    } else if (t === B || t === R) {
      const d0 = t === B ? 4 : 0;
      const d1 = t === B ? 8 : 4;
      let m = 0;
      for (let d = d0; d < d1; d += 1) {
        const ray = RAYONS[d][s];
        for (let i = 0; i < ray.length; i += 1) {
          const v = cs[ray[i]];
          if (v === 0) {
            m += 1;
          } else {
            if ((v >> 3) !== camp) m += 1;
            break;
          }
        }
      }
      vm += (m - MOB_BASE[t]) * MOB_POIDS_MJ[t];
      vf += (m - MOB_BASE[t]) * MOB_POIDS_FIN[t];
      if (t === B) {
        foux[camp] += 1;
      } else {
        const propres = nbPions[camp][f];
        const adverses = nbPions[camp ^ 1][f];
        if (propres === 0) {
          const bonus = adverses === 0 ? 20 : 10;
          vm += bonus;
          vf += bonus - 4;
        }
        const septieme = camp === 0 ? r === 6 : r === 1;
        if (septieme) {
          vm += 12;
          vf += 20;
        }
      }
    } else if (t === K) {
      if (camp === 0) roiB = s;
      else roiN = s;
      // abri du roi : pions devant lui, pris sur trois colonnes
      const rel = camp === 0 ? r : 7 - r;
      if (rel <= 1) {
        let abri = 0;
        for (let g = Math.max(0, f - 1); g <= Math.min(7, f + 1); g += 1) {
          if (nbPions[camp][g] === 0) {
            abri -= 12; // colonne sans pion devant le roi
          } else {
            const devant = camp === 0 ? rangMin[camp][g] : 7 - rangMax[camp][g];
            if (devant <= 2) abri += 8;
          }
        }
        vm += abri;
      }
    }
    mj += signe * vm;
    fin += signe * vf;
  }

  if (foux[0] >= 2) {
    mj += 30;
    fin += 50;
  }
  if (foux[1] >= 2) {
    mj -= 30;
    fin -= 50;
  }

  // Position morte : rien pour mater, quel que soit ce que disent les tables.
  // On ne l'examine que quand il reste très peu de matériel — la vérifier à
  // chaque appel coûterait plus cher que tout le reste de l'évaluation.
  if (phase <= 2 && pionsTotal === 0 && materielInsuffisant(p)) return 0;

  const ph = Math.min(phase, PHASE_MAX);
  let score = Math.trunc((mj * ph + fin * (PHASE_MAX - ph)) / PHASE_MAX);

  // Finale gagnée : sans guide, le moteur sait qu'il gagne mais pas comment.
  // On lui fait pousser le roi adverse vers le bord et rapprocher le sien.
  const ecart = matBlanc - matNoir;
  if (ecart >= 300 && nbPions[1].every((n) => n === 0) && matNoir <= 330) {
    score += 4 * distanceCentre(roiN) + 2 * (14 - distanceRois(roiB, roiN));
  } else if (-ecart >= 300 && nbPions[0].every((n) => n === 0) && matBlanc <= 330) {
    score -= 4 * distanceCentre(roiB) + 2 * (14 - distanceRois(roiB, roiN));
  }

  return p.trait === 0 ? score + 8 : -score + 8;
}

/** Vrai s'il reste au camp autre chose que des pions et son roi. */
export function aDesPieces(p: Plateau, camp: number): boolean {
  const cs = p.cases;
  for (let s = 0; s < 64; s += 1) {
    const c = cs[s];
    if (c === 0 || (c >> 3) !== camp) continue;
    const t = c & 7;
    if (t !== P && t !== K) return true;
  }
  return false;
}

void ROI;
