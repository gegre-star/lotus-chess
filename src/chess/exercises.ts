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
 * réellement parmi les meilleurs de la position. Les finales, que la
 * recherche à trois demi-coups de l'application ne voit pas, le sont par les
 * preuves de Stockfish et par un solveur exact des finales roi et pion contre
 * roi (`__tests__/preuves-exercices.test.ts`).
 *
 * Les coups sont écrits en notation française — R roi, D dame, T tour, F fou,
 * C cavalier, rien pour un pion — que la leçon « Les cases et les coups »
 * introduit avant toute autre.
 */

export type ExerciseTheme =
  | 'valeur-des-pieces'
  | 'controle-du-centre'
  | 'pieces-en-prise'
  | 'mats-de-base'
  | 'finales'
  | 'securite-du-roi';

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
  {
    id: 'mats-de-base',
    nom: 'Les mats de base',
    objectif: 'Trouver un mat en un ou deux coups dans 4 positions sur 5.',
    icone: '🏁',
  },
  {
    id: 'finales',
    nom: 'Les finales',
    objectif: 'Choisir le coup qui gagne — ou qui sauve la nulle — dans quatre finales classiques.',
    icone: '♟️',
  },
  {
    id: 'securite-du-roi',
    nom: 'La sécurité du roi',
    objectif: 'Savoir quand le roque est permis, et parer le mat du berger.',
    icone: '🏰',
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
  /**
   * Vrai quand l'exercice porte sur une règle du jeu et non sur la qualité
   * d'un coup : la réponse est définie par la règle, pas par le moteur. Les
   * autres coups légaux peuvent être excellents — on n'exige donc pas que
   * `attendus` soit le meilleur coup, seulement qu'il soit l'unique coup qui
   * répond à la consigne.
   */
  regle?: boolean;
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
    // Deux pièces reprennent, et la reprise est elle-même reprenable : c'est le
    // seul cas où l'ordre compte. L'ancienne position (une dame noire en d4,
    // que seul le pion e3 pouvait prendre) ne comptait qu'une reprise : l'indice
    // « deux pièces peuvent reprendre » et l'explication étaient faux.
    fen: 'r3k3/pp3ppp/8/4p3/3n4/4PN2/PP3PPP/R3K3 w - - 0 1',
    attendus: ['e3d4'],
    indices: [
      { texte: 'Deux de tes pièces peuvent reprendre en d4 : le pion e3 et le cavalier f3. Elles ne valent pas la même chose.', cases: ['e3', 'f3', 'd4'] },
      { texte: 'La reprise peut elle-même être reprise par le pion e5. Mieux vaut y aller avec la pièce la moins chère.' },
      { texte: 'Reprends avec le pion : exd4. Si les noirs reprennent avec e5, ton cavalier reprend à son tour.', cases: ['e3', 'd4'], solution: true },
    ],
    explication:
      'Quand plusieurs pièces peuvent reprendre, on commence par la moins chère. Après exd4 exd4 Cxd4, ' +
      'tu as gagné un cavalier (3) et un pion (1) contre un pion : +3. Après Cxd4 exd4 exd4, ' +
      'tu as échangé les deux cavaliers et ne gagnes qu’un pion : +1.',
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
    // Cc3 sort aussi le cavalier du bon côté, à vingt centièmes de Cf3 selon
    // Stockfish : refuser sèchement un bon développement n'apprendrait rien
    toleres: ['b1c3'],
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
    // Des pions de chaque côté : sans eux, perdre la tour laissait le roi seul
    // contre roi et fou — une nulle — et l'exercice n'avait aucun enjeu.
    fen: '4k3/6pp/8/8/3b4/8/6PP/R3K3 w Q - 0 1',
    // toutes les cases hors de la diagonale d4–a1 conviennent, à deux
    // exceptions : a7, que le fou attaque aussi, et a5, où ...Fc3+ fourche le
    // roi et la tour. Cette fourchette ne coûtait rien dans l'ancienne position,
    // où perdre la tour laissait roi contre roi et fou — une nulle ; avec les
    // pions elle coûte cinq points (−4,4 contre +0,5 pour Stockfish), et a5
    // ne peut plus être accepté. Le grand roque sauve la tour en la portant en
    // d1 : c'est une réponse juste, on l'accepte.
    attendus: [
      'a1a2', 'a1a3', 'a1a4', 'a1a6', 'a1a8', 'a1b1', 'a1c1', 'a1d1', 'e1c1',
    ],
    indices: [
      { texte: 'Regarde la diagonale du fou noir.', cases: ['d4', 'a1'] },
      { texte: 'Le fou attaque ta tour et rien ne la défend : si les noirs la prennent, tu perds 5 points sans rien reprendre.' },
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
    // seconde réponse sans rapport avec la consigne. Les pions g et h, eux,
    // donnent un enjeu : avec les seuls rois, quinze coups sur seize valaient
    // 0,00 et la position ne distinguait rien. Ils sont sur les colonnes g et h
    // pour ne pas offrir un second défenseur au cavalier (f3 ou d3).
    fen: '8/1p2k1pp/4r3/8/4N3/8/6PP/R3K3 w Q - 0 1',
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

  // ---- les mats de base ----
  {
    id: 'mb-simple-dabord',
    theme: 'mats-de-base',
    niveau: 1,
    consigne: 'Avant de réfléchir longtemps, cherche le coup le plus simple.',
    fen: '6k1/5ppp/8/8/8/8/1Q3PPP/6K1 w - - 0 1',
    attendus: ['b2b8'],
    indices: [
      { texte: 'Passe en revue les échecs d’abord : il y en a peu, et l’un d’eux est peut-être le dernier.', cases: ['g8'] },
      { texte: 'Le roi noir est enfermé derrière ses propres pions : une dame sur la dernière rangée le prive de toute fuite.', cases: ['f7', 'g7', 'h7'] },
      { texte: 'Joue Db8 : échec sur la 8e rangée, les pions empêchent la fuite : c’est mat.', cases: ['b2', 'b8'], solution: true },
    ],
    explication:
      'Avant de calculer des variantes, on vérifie dans l’ordre les échecs, les prises, les menaces. ' +
      'Ici le premier échec est déjà un mat : inutile de chercher plus loin. À la pendule, ' +
      'le temps gagné sur les positions simples sert aux positions difficiles.',
  },
  {
    id: 'mb-tour-et-roi',
    theme: 'mats-de-base',
    niveau: 1,
    consigne: 'Les rois se font face : mate en un coup avec ta tour.',
    fen: '4k3/8/4K3/8/8/8/8/R7 w - - 0 1',
    attendus: ['a1a8'],
    indices: [
      { texte: 'Ton roi tient déjà d7, e7 et f7. Où le roi noir peut-il encore aller ?', cases: ['d7', 'e7', 'f7'] },
      { texte: 'Il ne lui reste que d8 et f8, sur sa propre rangée. Une tour placée sur cette rangée lui donne échec et lui enlève ces deux cases.', cases: ['d8', 'f8'] },
      { texte: 'Joue Ta8 : échec sur toute la 8e rangée, et le roi noir n’a plus aucune case : mat.', cases: ['a1', 'a8'], solution: true },
    ],
    explication:
      'Ton roi retire au roi adverse la rangée qui le précède, la tour donne l’échec sur la dernière : ' +
      'c’est le mat de base à connaître, roi et tour contre roi, avec les rois face à face.',
  },
  {
    id: 'mb-roi-avant-dame',
    theme: 'mats-de-base',
    niveau: 2,
    consigne: 'Mate en deux coups : amène d’abord ton roi.',
    fen: '7k/8/8/5K2/8/8/8/6Q1 w - - 0 1',
    attendus: ['f5f6'],
    indices: [
      { texte: 'La dame seule ne peut pas mater : elle a besoin du roi. Regarde où il peut aller.', cases: ['f5', 'f6'] },
      { texte: 'Un roi bien placé enlève des cases au roi noir. Attention : Dg6 prive le roi noir de toute case sans lui donner échec — c’est pat, donc nulle.', cases: ['g6'] },
      { texte: 'Joue Rf6 : le roi noir n’a plus que h7, et Dg7 sera mat, protégée par ton roi.', cases: ['f5', 'f6'], solution: true },
    ],
    explication:
      'Avec la dame, on mate en amenant le roi d’abord, puis en donnant l’échec protégé par lui. ' +
      'Rf6, Rh7 forcé, Dg7 : mat en deux coups. Le piège à éviter est le pat : Dg6 aurait laissé le roi noir ' +
      'sans coup légal alors qu’il n’était pas en échec.',
  },
  {
    id: 'mb-couloir-en-deux',
    theme: 'mats-de-base',
    niveau: 2,
    consigne: 'Mat en deux coups sur la dernière rangée : trouve le premier.',
    fen: '3r2k1/pp3ppp/2p2n2/8/8/2P2N2/PP3PPP/3R2K1 w - - 0 1',
    attendus: ['d1d8'],
    indices: [
      { texte: 'La tour noire est la seule pièce qui garde la dernière rangée.', cases: ['d8', 'd1'] },
      { texte: 'Ta tour peut la prendre avec échec. Le roi noir ne peut pas fuir, mais une pièce noire peut s’interposer : laquelle ?', cases: ['d8', 'f6', 'e8'] },
      { texte: 'Joue Txd8+ : le cavalier doit s’interposer en e8, puis Txe8 est mat.', cases: ['d1', 'd8'], solution: true },
    ],
    explication:
      'On supprime le défenseur de la dernière rangée en le prenant avec échec. Le cavalier n’a pas d’autre ' +
      'parade que de s’interposer en e8, et la tour qui le prend donne mat : le roi reste emmuré derrière ses pions.',
  },

  // ---- les finales ----
  {
    id: 'fi-regle-du-carre',
    theme: 'finales',
    niveau: 2,
    consigne: 'Ton pion passera-t-il seul ? Joue le coup qui le prouve.',
    fen: '8/8/8/5k2/P7/8/8/7K w - - 0 1',
    attendus: ['a4a5'],
    indices: [
      { texte: 'Le roi noir est loin du pion, mais chaque coup que tu perds le rapproche.', cases: ['a4', 'f5'] },
      { texte: 'Imagine un carré dont un côté va du pion à sa case de promotion. Si le roi noir, à son tour de jouer, peut y entrer, il rattrape le pion.', cases: ['a4', 'd4', 'a8', 'd8'] },
      { texte: 'Joue a5 sans attendre : un coup de roi te ferait perdre un temps, et le roi noir entrerait dans le carré.', cases: ['a4', 'a5'], solution: true },
    ],
    explication:
      'La règle du carré : on trace le carré dont le côté est la distance du pion à sa case de promotion. ' +
      'Si le roi adverse, à son tour de jouer, ne peut pas y entrer, le pion court à la dame sans aide. ' +
      'Ici, a5 : le roi noir est encore hors du carré a5–d8 et n’y entrera jamais à temps. ' +
      'Un coup de roi à la place, et il aurait rattrapé le pion : nulle.',
  },
  {
    id: 'fi-case-cle',
    theme: 'finales',
    niveau: 2,
    consigne: 'Roi et pion contre roi : quel coup garde la victoire ?',
    fen: '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1',
    attendus: ['e6d6', 'e6f6'],
    indices: [
      { texte: 'Devant un pion en e5, trois cases sont « clés » : d6, e6 et f6. Un roi qui les occupe fait promouvoir le pion.', cases: ['d6', 'e6', 'f6'] },
      { texte: 'Ton roi est déjà sur une case clé, mais il doit bouger : le pion est bloqué derrière lui. Ne recule pas sur la 5e rangée, tu perdrais la case clé.' },
      { texte: 'Joue Rd6 (ou Rf6) : ton roi reste sur la 6e rangée, donc sur une case clé.', cases: ['e6', 'd6', 'f6'], solution: true },
    ],
    explication:
      'Le pion sur la 5e rangée a trois cases clés, sur la 6e. Un roi qui reste sur l’une d’elles gagne, ' +
      'quoi que joue l’adversaire. Rd5 ou Rf5 recule sur la 5e : le roi noir prend l’opposition et la partie est nulle.',
  },
  {
    id: 'fi-lucena',
    theme: 'finales',
    niveau: 3,
    consigne: 'Position de Lucena : commence à construire le pont.',
    fen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1',
    attendus: ['c1d1'],
    // presque toute la tour gagne ici : on ne juge pas la méthode du pont par la
    // seule évaluation, mais par la consigne. Les autres coups gagnants sont
    // tolérés — « bon coup, mais ce n'est pas la question » — plutôt que refusés.
    toleres: [
      'c1c3', 'c1c4', 'c1c5', 'c1c6', 'c1c7', 'c1c8', 'c1b1', 'c1e1', 'c1f1', 'c1g1', 'c1h1',
    ],
    indices: [
      { texte: 'Ton pion est à un pas de la promotion, mais ton roi lui barre la route et le roi noir est coupé sur la colonne c.', cases: ['b7', 'b8', 'd8'] },
      { texte: 'La méthode s’appelle « faire le pont » : la tour se place sur la 4e rangée pour abriter ton roi des échecs. Pour y arriver, il faut d’abord repousser le roi noir.', cases: ['c1', 'd8'] },
      { texte: 'Joue Td1+ : après ...Re7, Td4 construit le pont, et ton roi peut sortir en c7.', cases: ['c1', 'd1'], solution: true },
    ],
    explication:
      'La position de Lucena est la plus célèbre des finales de tours : un pion sur la 7e rangée, son roi devant ' +
      'lui, le roi adverse coupé. On gagne en trois temps : repousser le roi adverse par un échec, placer la tour ' +
      'en 4e rangée — le pont —, puis sortir le roi à l’abri de ses échecs. Plusieurs premiers coups gagnent aussi ; ' +
      'celui-ci a l’avantage de montrer la méthode.',
  },
  {
    id: 'fi-philidor',
    theme: 'finales',
    niveau: 3,
    consigne: 'Défense Philidor : garde ta tour sur la 6e rangée, sans la perdre.',
    fen: '4k3/8/r7/3PK3/8/8/8/3R4 b - - 0 1',
    attendus: ['a6b6', 'a6g6', 'a6h6'],
    // les autres coups qui tiennent la nulle : ils quittent la 6e rangée ou
    // laissent la tour à sa place en bougeant le roi. Ils ne sont pas des fautes.
    toleres: [
      'a6a2', 'a6a3', 'a6a4', 'a6a5', 'a6a7', 'a6a8', 'e8d7', 'e8d8', 'e8e7', 'e8f7', 'e8f8',
    ],
    indices: [
      { texte: 'Le pion d5 contrôle c6, et le roi blanc contrôle d6, e6 et f6.', cases: ['d5', 'e5', 'c6', 'd6', 'e6', 'f6'] },
      { texte: 'Ta tour est déjà sur la 6e rangée : de là elle empêche le roi blanc d’avancer. Déplace-la le long de cette rangée, mais pas sur une case attaquée.' },
      { texte: 'Joue Tb6 (ou Tg6, ou Th6) : la tour reste sur la 6e rangée et n’est pas prise.', cases: ['a6', 'b6', 'g6', 'h6'], solution: true },
    ],
    explication:
      'Défense Philidor : tant que le pion blanc n’a pas atteint la 6e rangée, la tour noire reste sur cette ' +
      'rangée et le roi noir sur sa dernière : le roi blanc ne peut pas avancer. Quand le pion avance en d6, la ' +
      'tour passe sur la 1re rangée pour donner des échecs par derrière. Les coups tentants sont des pièges : ' +
      'Td6 et Tf6 perdent la tour contre le roi, Tc6 contre le pion, et Ta1 la livre à la tour blanche.',
  },

  // ---- la sécurité du roi ----
  {
    id: 'sr-roque-permis',
    theme: 'securite-du-roi',
    niveau: 1,
    consigne: 'Un seul des deux roques est permis. Joue-le.',
    fen: '4k3/8/8/8/8/5r2/8/R3K2R w KQ - 0 1',
    attendus: ['e1c1'],
    regle: true,
    indices: [
      { texte: 'Regarde la tour noire : quelles cases de la 1re rangée surveille-t-elle ?', cases: ['f3', 'f1'] },
      { texte: 'Le roi ne peut pas roquer s’il est en échec, ni s’il traverse une case attaquée ou arrive sur une case attaquée. Le petit roque passe par f1.', cases: ['f1', 'g1'] },
      { texte: 'Joue le grand roque : le roi va en c1, la tour en d1. Le petit roque est interdit, la tour noire attaque f1.', cases: ['e1', 'c1'], solution: true },
    ],
    explication:
      'Le roque est impossible si le roi ou la tour a déjà bougé, si le roi est en échec, ou s’il traverse ou ' +
      'atteint une case attaquée. Ici la tour noire attaque f1 : le petit roque est interdit. Le grand passe ' +
      'par d1 et c1, que personne n’attaque : il reste permis.',
  },
  {
    id: 'sr-berger-attaque',
    theme: 'securite-du-roi',
    niveau: 1,
    consigne: 'Les noirs n’ont pas défendu f7. Punis-les.',
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
    attendus: ['h5f7'],
    indices: [
      { texte: 'Compte les attaquants de f7, puis ses défenseurs.', cases: ['f7', 'c4', 'h5'] },
      { texte: 'Le fou c4 et la dame h5 visent f7, que le roi noir est seul à défendre. Un roi ne peut pas prendre une pièce protégée.', cases: ['e8', 'f7'] },
      { texte: 'Joue Dxf7 : protégée par le fou, la dame donne mat.', cases: ['h5', 'f7'], solution: true },
    ],
    explication:
      'C’est le mat du berger : dame et fou visent f7, la case la plus faible du camp noir au début de la partie, ' +
      'défendue par le seul roi. Le roi ne peut pas reprendre une dame protégée. Pour l’éviter avec les noirs, ' +
      'passe à l’exercice suivant.',
  },
  {
    id: 'sr-berger-defense',
    theme: 'securite-du-roi',
    niveau: 2,
    consigne: 'Les blancs menacent Dxf7, mat. Défends-toi.',
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3',
    attendus: ['g7g6', 'd8e7'],
    // deux autres parades tiennent la position : la dame en f6 et le cavalier en h6
    toleres: ['d8f6', 'g8h6'],
    indices: [
      { texte: 'La dame h5 et le fou c4 visent la même case. Laquelle ?', cases: ['h5', 'c4', 'f7'] },
      { texte: 'Deux façons de parer : chasser la dame avec un pion, ou défendre f7 avec une pièce. Attention : Cf6 attaque la dame mais n’arrête pas Dxf7, qui est mat.', cases: ['f7'] },
      { texte: 'Joue g6 : le pion chasse la dame. De7 défend f7 aussi bien.', cases: ['g7', 'g6'], solution: true },
    ],
    explication:
      'Contre le mat du berger, il suffit de défendre f7 ou de chasser la dame : g6 attaque la dame avec un pion, ' +
      'De7 ou Ch6 défendent la case. Un coup qui ne s’occupe pas de f7 — même en attaquant la dame, comme Cf6 — ' +
      'perd sur-le-champ.',
  },
];

export const exercisesByTheme = (theme: ExerciseTheme): Exercise[] =>
  EXERCISES.filter((e) => e.theme === theme).sort((a, b) => a.niveau - b.niveau);
