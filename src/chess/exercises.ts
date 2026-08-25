/**
 * Exercices pratiques.
 *
 * Une notion expliquée n'est pas une notion acquise : chaque thème doit se
 * terminer par des positions où l'élève joue. Le format est volontairement
 * plat et sérialisable — position, coups acceptés, indices, explication — pour
 * que le contenu se relise et se vérifie sans lire le code des écrans.
 *
 * Toutes les positions et tous les coups attendus sont validés par le moteur
 * dans `__tests__/exercises.test.ts` : position légale, coup jouable, et coup
 * réellement parmi les meilleurs de la position.
 */

export type ExerciseTheme = 'valeur-des-pieces' | 'controle-du-centre' | 'pieces-en-prise';

export interface ThemeInfo {
  id: ExerciseTheme;
  nom: string;
  /** Objectif d'apprentissage, formulé de façon mesurable. */
  objectif: string;
  icone: string;
}

export const THEMES: ThemeInfo[] = [
  {
    id: 'valeur-des-pieces',
    nom: 'La valeur des pièces',
    objectif: 'Reconnaître un échange gagnant dans 4 positions sur 5.',
    icone: '⚖️',
  },
  {
    id: 'controle-du-centre',
    nom: 'Le contrôle du centre',
    objectif: 'Choisir le coup qui occupe ou attaque le centre dans 4 cas sur 5.',
    icone: '🎯',
  },
  {
    id: 'pieces-en-prise',
    nom: 'Les pièces en prise',
    objectif: 'Repérer et sauver une pièce attaquée avant de jouer autre chose.',
    icone: '⚠️',
  },
];

/**
 * Un indice. Les trois niveaux vont du plus léger au plus explicite : orienter
 * le regard, poser la question utile, puis donner la réponse.
 */
export interface Hint {
  texte: string;
  /** Cases à surligner en même temps que l'indice. */
  cases?: string[];
  /** Vrai pour le dernier niveau, qui montre le coup à jouer. */
  solution?: boolean;
}

export interface Exercise {
  id: string;
  theme: ExerciseTheme;
  /** 1 débutant, 2 intermédiaire, 3 confirmé. */
  niveau: 1 | 2 | 3;
  /** Consigne courte : elle doit se comprendre en moins de dix secondes. */
  consigne: string;
  fen: string;
  /** Coups acceptés, au format UCI. Plusieurs quand la position en admet. */
  attendus: string[];
  /**
   * Coups objectivement bons mais qui ne répondent pas à la consigne.
   *
   * Refuser sèchement un coup fort décourage sans rien apprendre : au premier
   * coup d'une partie, Cc3 vaut e4, mais l'exercice porte sur les pions. Les
   * lister permet de répondre « bon coup, mais ce n'est pas la question ici »
   * au lieu de « faux ».
   */
  toleres?: string[];
  indices: [Hint, Hint, Hint];
  /** Ce que l'élève doit retenir, une fois la position résolue. */
  explication: string;
}

export const EXERCISES: Exercise[] = [
  // ---- la valeur des pièces ----
  {
    id: 'vp-tour-ou-pion',
    theme: 'valeur-des-pieces',
    niveau: 1,
    consigne: 'Ton cavalier peut prendre deux choses. Prends la bonne.',
    fen: '4k3/8/6p1/3r1p2/8/4N3/8/4K3 w - - 0 1',
    attendus: ['e3d5'],
    indices: [
      { texte: 'Regarde ce que chaque prise te coûterait.', cases: ['d5', 'f5'] },
      { texte: 'Le pion f5 est défendu par le pion g6. La tour d5, elle, ne l’est par personne.' },
      { texte: 'Joue Cxd5 : la tour vaut 5 points et rien ne reprend.', cases: ['e3', 'd5'], solution: true },
    ],
    explication:
      'Une prise ne vaut que par ce qu’elle laisse derrière. Cxf5 gagne 1 point puis en perd 3 : ' +
      '−2. Cxd5 gagne 5 points et ne perd rien.',
  },
  {
    id: 'vp-dame-gratuite',
    theme: 'valeur-des-pieces',
    niveau: 1,
    consigne: 'Une pièce adverse ne vaut pas la peine d’être prise. Trouve l’autre.',
    fen: '4k3/8/8/3q1n2/4B3/8/8/4K3 w - - 0 1',
    attendus: ['e4d5'],
    indices: [
      { texte: 'Compare les deux prises en points.', cases: ['d5', 'f5'] },
      { texte: 'La dame vaut 9 points, le cavalier 3. Laquelle est défendue ?' },
      { texte: 'Joue Fxd5 et gagne la dame.', cases: ['e4', 'd5'], solution: true },
    ],
    explication: 'À choisir, on prend toujours la pièce la plus chère si les deux sont libres.',
  },
  {
    id: 'vp-mauvaise-reprise',
    theme: 'valeur-des-pieces',
    niveau: 2,
    consigne: 'Les noirs viennent de prendre en d4. Reprends de la bonne façon.',
    fen: '4k3/8/8/8/3q4/2N1P3/8/4K3 w - - 0 1',
    attendus: ['e3d4'],
    indices: [
      { texte: 'Deux pièces peuvent reprendre. Elles ne valent pas la même chose.', cases: ['c3', 'e3'] },
      { texte: 'Si la reprise peut elle-même être reprise, mieux vaut y aller avec la pièce la moins chère.' },
      { texte: 'Reprends avec le pion : exd4.', cases: ['e3', 'd4'], solution: true },
    ],
    explication:
      'Quand plusieurs pièces peuvent reprendre, on commence par la moins chère. C’est elle qu’on ' +
      'risque le moins de regretter.',
  },

  // ---- le contrôle du centre ----
  {
    id: 'cc-premier-coup',
    theme: 'controle-du-centre',
    niveau: 1,
    consigne: 'Premier coup de la partie : occupe le centre avec un pion.',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    attendus: ['e2e4', 'd2d4'],
    toleres: ['b1c3', 'g1f3'],
    indices: [
      { texte: 'Les quatre cases qui comptent sont au milieu.', cases: ['d4', 'e4', 'd5', 'e5'] },
      { texte: 'Quel pion peut aller sur l’une d’elles en un coup, tout en libérant une pièce ?' },
      { texte: 'Joue e4 (ou d4) : le pion occupe le centre et ouvre la diagonale du fou.', cases: ['e2', 'e4'], solution: true },
    ],
    explication:
      'Un pion au centre prend de la place et ouvre le chemin aux fous et à la dame. a3 ou h3 ne ' +
      'font ni l’un ni l’autre.',
  },
  {
    id: 'cc-cavalier-au-bord',
    theme: 'controle-du-centre',
    niveau: 1,
    consigne: 'Sors ton cavalier du bon côté.',
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    attendus: ['g1f3'],
    indices: [
      { texte: 'Compte les cases que le cavalier contrôlerait depuis chaque case possible.', cases: ['f3', 'h3'] },
      { texte: 'Depuis h3 le cavalier ne vise que trois cases, et aucune n’est au centre.' },
      { texte: 'Joue Cf3 : le cavalier attaque e5 et regarde le centre.', cases: ['g1', 'f3'], solution: true },
    ],
    explication:
      'Un cavalier au bord contrôle deux fois moins de cases qu’au centre. D’où le dicton : ' +
      '« cavalier au bord, cavalier mort ».',
  },
  {
    id: 'cc-pousse-ou-defends',
    theme: 'controle-du-centre',
    niveau: 2,
    consigne: 'Renforce ton centre plutôt que de jouer sur l’aile.',
    fen: 'rnbqkbnr/ppp2ppp/3p4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3',
    attendus: ['d2d4'],
    toleres: ['b1c3', 'f1b5'],
    indices: [
      { texte: 'Ton pion e4 est seul au centre.', cases: ['d4', 'e4'] },
      { texte: 'Quel pion peut venir l’épauler et attaquer e5 en même temps ?' },
      { texte: 'Joue d4 : deux pions au centre valent bien mieux qu’un.', cases: ['d2', 'd4'], solution: true },
    ],
    explication:
      'Deux pions côte à côte au centre se défendent l’un l’autre et enlèvent des cases aux pièces ' +
      'adverses.',
  },

  // ---- les pièces en prise ----
  {
    id: 'pp-sauve-la-tour',
    theme: 'pieces-en-prise',
    niveau: 1,
    consigne: 'Une de tes pièces est attaquée. Sauve-la.',
    fen: '4k3/8/8/8/3b4/8/8/R3K3 w Q - 0 1',
    // toutes les cases hors de la diagonale d4–a1 conviennent ; a7 en fait
    // partie et ne compte donc pas. Le grand roque sauve la tour en la
    // portant en d1 : c'est une réponse juste, on l'accepte.
    attendus: [
      'a1a2', 'a1a3', 'a1a4', 'a1a5', 'a1a6', 'a1a8', 'a1b1', 'a1c1', 'a1d1', 'e1c1',
    ],
    indices: [
      { texte: 'Regarde la diagonale du fou noir.', cases: ['d4', 'a1'] },
      { texte: 'La tour vaut 5 points, le fou 3. La laisser prendre coûterait 2 points.' },
      { texte: 'Déplace la tour hors de la diagonale, par exemple Ta4.', cases: ['a1', 'a4'], solution: true },
    ],
    explication:
      'Avant de chercher un beau coup, on vérifie toujours ce que l’adversaire menace de prendre.',
  },
  {
    id: 'pp-defends-plutot',
    theme: 'pieces-en-prise',
    niveau: 2,
    consigne: 'Ton cavalier est cloué et ne peut pas bouger. Défends-le.',
    // le pion b7 n'est pas décoratif : sans lui, la tour blanche donne échec
    // en montant sur la rangée du roi noir, ce qui offrirait à l'exercice une
    // seconde réponse sans rapport avec la consigne
    fen: '8/1p2k3/4r3/8/4N3/8/8/R3K3 w Q - 0 1',
    attendus: ['a1a4'],
    indices: [
      { texte: 'La tour noire de e6 vise ton cavalier, et ton roi est juste derrière.', cases: ['e6', 'e4', 'e1'] },
      { texte: 'Le cavalier ne peut pas bouger : il découvrirait ton roi. Il faut donc le défendre.' },
      { texte: 'Ta4 défend le cavalier le long de la quatrième rangée.', cases: ['a1', 'a4'], solution: true },
    ],
    explication:
      'Une pièce clouée devant son roi ne peut pas fuir. Il reste deux réponses : la défendre, ou ' +
      'faire disparaître l’attaquant.',
  },
];

export const exercisesByTheme = (theme: ExerciseTheme): Exercise[] =>
  EXERCISES.filter((e) => e.theme === theme).sort((a, b) => a.niveau - b.niveau);
