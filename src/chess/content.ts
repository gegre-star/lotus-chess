/**
 * Contenu pédagogique de Lotus Chess.
 *
 * Chaque position et chaque solution a été vérifiée par le moteur
 * (voir `__tests__/content.test.ts`) : coups légaux, positions licites,
 * objectifs réellement atteignables.
 *
 * Les textes, les personnages et les positions sont originaux. Les trois
 * parties de la section « Observer » sont des relevés historiques.
 */
import type { PieceType } from './engine';

/** Une étape de leçon : le coach parle, des flèches montrent, l'élève joue. */
export interface LessonStep {
  fen: string;
  say: string;
  /** Coup que l'élève doit trouver pour continuer. */
  task?: { from: string; to: string; promotion?: PieceType };
  /** Flèches explicites à tracer. */
  arrows?: [string, string][];
  /** Trace une flèche vers chaque coup légal de la pièce occupant cette case. */
  arrowsFrom?: string;
}

export interface Lesson {
  id: string;
  /** Index dans `SECTIONS` : 0 débutant, 1 intermédiaire, 2 avancé. */
  sec: number;
  title: string;
  sub: string;
  coach: CoachId;
  icon: string;
  steps: LessonStep[];
}

export type CoachId = 'lotus' | 'nina' | 'robi';

export interface Section {
  name: string;
  desc: string;
}

/** Un coup de solution : case de départ, case d'arrivée, promotion éventuelle. */
export type LineMove = [string, string] | [string, string, PieceType];

export interface Puzzle {
  id: string;
  theme: string;
  /** Difficulté indicative, de 600 à 1550. */
  rating: number;
  fen: string;
  /** Variante principale calculée par le moteur. */
  line: LineMove[];
  hint: string;
  desc: string;
  /** Vrai si l'objectif est un mat ; sinon il faut gagner `gain` pions de matériel. */
  mate: boolean;
  gain: number;
}

export interface Bot {
  id: string;
  nom: string;
  elo: number;
  /** Profondeur de recherche. */
  depth: number;
  /** Probabilité de jouer un coup au hasard, pour doser la force. */
  gaffe: number;
  say: string;
  /**
   * Confie les coups à Stockfish, à la force indiquée par `elo`.
   *
   * Sur iOS et Android, Hermes n'exécute ni WebAssembly ni Web Worker :
   * l'adversaire retombe alors sur `depth` et `gaffe` comme les autres.
   */
  stockfish?: boolean;
}

export interface Opening {
  nom: string;
  /** Coups en notation anglaise standard. */
  san: string;
  note: string;
}

export interface Trophy {
  id: string;
  name: string;
  art: string;
  desc: string;
}

export interface FamousGame {
  id: string;
  titre: string;
  lieu: string;
  blancs: string;
  noirs: string;
  coups: LineMove[];
  /** Camp du maître dont on cherche les coups. */
  heros: 'w' | 'b';
  /** Ce que la partie est censée apprendre, en une phrase. */
  lecon: string;
}

export const SECTIONS: Section[] = [
  {
    "name": "Débutant",
    "desc": "Les règles et les premiers mats"
  },
  {
    "name": "Intermédiaire",
    "desc": "Principes et motifs tactiques"
  },
  {
    "name": "Avancé",
    "desc": "Technique et finales"
  }
];

export const LESSONS: Lesson[] = [
  {
    "id": "pion",
    "sec": 0,
    "title": "Le pion",
    "sub": "Avance, capture, promotion",
    "coach": "lotus",
    "icon": "p",
    "steps": [
      {
        "fen": "8/8/8/8/8/8/4P3/K5k1 w - - 0 1",
        "say": "Voici un pion. Il avance tout droit, une case à la fois. Mais depuis sa case de départ, il a droit à un double pas !",
        "arrowsFrom": "e2"
      },
      {
        "fen": "8/8/8/8/8/8/4P3/K5k1 w - - 0 1",
        "say": "À toi : avance le pion de deux cases jusqu'en e4.",
        "task": {
          "from": "e2",
          "to": "e4"
        },
        "arrows": [
          [
            "e2",
            "e4"
          ]
        ]
      },
      {
        "fen": "8/8/8/3p4/4P3/8/8/K5k1 w - - 0 1",
        "say": "Attention : le pion avance tout droit, mais il capture en diagonale.",
        "arrowsFrom": "e4"
      },
      {
        "fen": "8/8/8/3p4/4P3/8/8/K5k1 w - - 0 1",
        "say": "Capture le pion noir en d5 !",
        "task": {
          "from": "e4",
          "to": "d5"
        },
        "arrows": [
          [
            "e4",
            "d5"
          ]
        ]
      }
    ]
  },
  {
    "id": "tour",
    "sec": 0,
    "title": "La tour",
    "sub": "Lignes et colonnes",
    "coach": "lotus",
    "icon": "r",
    "steps": [
      {
        "fen": "8/8/8/3R4/8/8/8/K5k1 w - - 0 1",
        "say": "La tour glisse en ligne droite : toute la colonne, toute la rangée. Redoutable en terrain dégagé.",
        "arrowsFrom": "d5"
      },
      {
        "fen": "3r4/8/8/3R4/8/8/8/K5k1 w - - 0 1",
        "say": "Une pièce s'arrête sur un obstacle — ou le capture. Prends la tour noire en d8.",
        "task": {
          "from": "d5",
          "to": "d8"
        },
        "arrows": [
          [
            "d5",
            "d8"
          ]
        ]
      }
    ]
  },
  {
    "id": "fou",
    "sec": 0,
    "title": "Le fou",
    "sub": "Les diagonales",
    "coach": "lotus",
    "icon": "b",
    "steps": [
      {
        "fen": "8/8/8/3B4/8/8/8/K5k1 w - - 0 1",
        "say": "Le fou ne suit que les diagonales. Il reste donc toute la partie sur la même couleur de cases.",
        "arrowsFrom": "d5"
      },
      {
        "fen": "6r1/8/8/3B4/8/8/8/K5k1 w - - 0 1",
        "say": "Prends la tour noire en g8, au bout de la diagonale.",
        "task": {
          "from": "d5",
          "to": "g8"
        },
        "arrows": [
          [
            "d5",
            "g8"
          ]
        ]
      }
    ]
  },
  {
    "id": "cavalier",
    "sec": 0,
    "title": "Le cavalier",
    "sub": "Le saut en L",
    "coach": "nina",
    "icon": "n",
    "steps": [
      {
        "fen": "8/8/8/3N4/8/8/8/K5k1 w - - 0 1",
        "say": "Mon préféré ! Le cavalier saute en L : deux cases puis une sur le côté. Et il passe par-dessus tout le monde.",
        "arrowsFrom": "d5"
      },
      {
        "fen": "8/8/8/3N4/8/8/8/K5k1 w - - 0 1",
        "say": "Remarque : d5 est une case claire, et toutes ses arrivées sont sombres. Le cavalier change de couleur à chaque saut.",
        "arrowsFrom": "d5"
      },
      {
        "fen": "8/2p5/8/3N4/8/8/8/K5k1 w - - 0 1",
        "say": "À toi : capture le pion en c7 d'un seul bond.",
        "task": {
          "from": "d5",
          "to": "c7"
        },
        "arrows": [
          [
            "d5",
            "c7"
          ]
        ]
      }
    ]
  },
  {
    "id": "dame",
    "sec": 0,
    "title": "La dame",
    "sub": "La pièce la plus puissante",
    "coach": "lotus",
    "icon": "q",
    "steps": [
      {
        "fen": "8/8/8/3Q4/8/8/8/K5k1 w - - 0 1",
        "say": "La dame combine la tour et le fou : lignes, colonnes et diagonales. Regarde tout ce qu'elle couvre.",
        "arrowsFrom": "d5"
      },
      {
        "fen": "3r4/8/8/3Q4/8/8/8/K5k1 w - - 0 1",
        "say": "Capture la tour en d8.",
        "task": {
          "from": "d5",
          "to": "d8"
        },
        "arrows": [
          [
            "d5",
            "d8"
          ]
        ]
      }
    ]
  },
  {
    "id": "roi",
    "sec": 0,
    "title": "Le roi",
    "sub": "Lent, mais irremplaçable",
    "coach": "lotus",
    "icon": "k",
    "steps": [
      {
        "fen": "8/8/8/3K4/8/8/7k/8 w - - 0 1",
        "say": "Le roi va dans toutes les directions, mais d'une seule case. Il est lent — et pourtant c'est lui qu'il faut protéger.",
        "arrowsFrom": "d5"
      },
      {
        "fen": "8/8/8/3K4/8/8/7k/8 w - - 0 1",
        "say": "Avance-le en d6.",
        "task": {
          "from": "d5",
          "to": "d6"
        },
        "arrows": [
          [
            "d5",
            "d6"
          ]
        ]
      }
    ]
  },
  {
    "id": "echec",
    "sec": 0,
    "title": "L’échec",
    "sub": "Menacer le roi",
    "coach": "nina",
    "icon": "bolt",
    "steps": [
      {
        "fen": "4k3/8/8/8/8/8/8/3R2K1 w - - 0 1",
        "say": "Quand une pièce attaque le roi, on dit « échec ». Amène ta tour en d8 pour donner échec.",
        "task": {
          "from": "d1",
          "to": "d8"
        },
        "arrows": [
          [
            "d1",
            "d8"
          ]
        ]
      },
      {
        "fen": "3Rk3/8/8/8/8/8/8/6K1 b - - 0 1",
        "say": "Le roi noir est en échec : il DOIT réagir. Ici, il n'a qu'à s'écarter. Joue-le en e7.",
        "task": {
          "from": "e8",
          "to": "e7"
        },
        "arrows": [
          [
            "e8",
            "e7"
          ]
        ]
      },
      {
        "fen": "3R4/4k3/8/8/8/8/8/6K1 w - - 0 1",
        "say": "Trois façons de parer un échec : fuir avec le roi, capturer l'attaquant, ou intercaler une pièce sur la ligne d'attaque."
      }
    ]
  },
  {
    "id": "mat",
    "sec": 0,
    "title": "L’échec et mat",
    "sub": "La fin de la partie",
    "coach": "nina",
    "icon": "mate",
    "steps": [
      {
        "fen": "6k1/5ppp/8/8/8/8/8/3R2K1 w - - 0 1",
        "say": "Le roi noir est enfermé par ses propres pions : ses seules fuites sont occupées.",
        "arrows": [
          [
            "g8",
            "f7"
          ],
          [
            "g8",
            "g7"
          ],
          [
            "g8",
            "h7"
          ]
        ]
      },
      {
        "fen": "6k1/5ppp/8/8/8/8/8/3R2K1 w - - 0 1",
        "say": "Joue ta tour en d8 : échec, aucune fuite, aucune parade. C'est échec et mat, tu as gagné !",
        "task": {
          "from": "d1",
          "to": "d8"
        },
        "arrows": [
          [
            "d1",
            "d8"
          ]
        ]
      }
    ]
  },
  {
    "id": "pat",
    "sec": 0,
    "title": "Le pat",
    "sub": "Le piège de la nulle",
    "coach": "lotus",
    "icon": "bolt",
    "steps": [
      {
        "fen": "7k/8/6Q1/8/8/8/8/6K1 b - - 0 1",
        "say": "Ici, les noirs doivent jouer… mais aucun coup n'est légal, et leur roi n'est PAS en échec. C'est le pat : partie nulle."
      },
      {
        "fen": "7k/5Q2/6K1/8/8/8/8/8 w - - 0 1",
        "say": "Ici le roi noir n'a déjà plus aucune case : si tu joues n'importe quoi, c'est pat ! Joue plutôt Dh7, protégée par ton roi : c'est mat.",
        "task": {
          "from": "f7",
          "to": "h7"
        },
        "arrows": [
          [
            "f7",
            "h7"
          ]
        ]
      }
    ]
  },
  {
    "id": "roque",
    "sec": 0,
    "title": "Le roque",
    "sub": "Mettre son roi à l’abri",
    "coach": "lotus",
    "icon": "k",
    "steps": [
      {
        "fen": "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4",
        "say": "Le roque est le seul coup où deux pièces bougent ensemble : le roi fait deux pas vers la tour, qui saute par-dessus lui.",
        "arrowsFrom": "e1"
      },
      {
        "fen": "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4",
        "say": "Roque : clique ton roi en e1, puis la case g1.",
        "task": {
          "from": "e1",
          "to": "g1"
        },
        "arrows": [
          [
            "e1",
            "g1"
          ]
        ]
      },
      {
        "fen": "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 0 5",
        "say": "Le roi est au coin, protégé par ses pions, et la tour rejoint le centre. Fais-le tôt, presque à chaque partie."
      }
    ]
  },
  {
    "id": "enpassant",
    "sec": 0,
    "title": "La prise en passant",
    "sub": "La règle qui surprend",
    "coach": "nina",
    "icon": "p",
    "steps": [
      {
        "fen": "8/8/8/3pP3/8/8/8/K5k1 w - d6 0 1",
        "say": "Le pion noir vient de faire un double pas pour esquiver ton pion. La règle t'autorise à le prendre quand même !",
        "arrows": [
          [
            "e5",
            "d6"
          ]
        ]
      },
      {
        "fen": "8/8/8/3pP3/8/8/8/K5k1 w - d6 0 1",
        "say": "Joue e5 vers d6 : ton pion capture « en passant ». Attention, c'est possible uniquement au coup suivant.",
        "task": {
          "from": "e5",
          "to": "d6"
        },
        "arrows": [
          [
            "e5",
            "d6"
          ]
        ]
      }
    ]
  },
  {
    "id": "promotion",
    "sec": 0,
    "title": "La promotion",
    "sub": "Le pion devient dame",
    "coach": "lotus",
    "icon": "q",
    "steps": [
      {
        "fen": "8/4P3/8/8/8/8/8/K5k1 w - - 0 1",
        "say": "Un pion qui atteint la dernière rangée se transforme — presque toujours en dame. Joue e8 !",
        "task": {
          "from": "e7",
          "to": "e8",
          "promotion": "Q"
        },
        "arrows": [
          [
            "e7",
            "e8"
          ]
        ]
      },
      {
        "fen": "4Q3/8/8/8/8/8/8/K5k1 w - - 0 1",
        "say": "Un simple pion vient de devenir la pièce la plus forte du jeu. C'est pour ça qu'en finale, chaque pion compte."
      }
    ]
  },
  {
    "id": "valeur",
    "sec": 1,
    "title": "La valeur des pièces",
    "sub": "Compter le matériel",
    "coach": "lotus",
    "icon": "bolt",
    "steps": [
      {
        "fen": "8/8/8/1QRBNP2/8/8/8/K5k1 w - - 0 1",
        "say": "Retiens ces valeurs : pion 1, cavalier 3, fou 3, tour 5, dame 9. Le roi n'a pas de prix : le perdre, c'est perdre."
      },
      {
        "fen": "8/8/8/1QRBNP2/8/8/8/K5k1 w - - 0 1",
        "say": "Échanger un fou (3) contre une tour (5), c'est gagner « la qualité ». Compte toujours avant de prendre une pièce."
      }
    ]
  },
  {
    "id": "centre",
    "sec": 1,
    "title": "Contrôler le centre",
    "sub": "Le principe n°1",
    "coach": "nina",
    "icon": "centre",
    "steps": [
      {
        "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "say": "Les quatre cases du milieu — d4, e4, d5, e5 — sont le cœur de l'échiquier. Qui les contrôle contrôle la partie.",
        "arrows": [
          [
            "e2",
            "e4"
          ],
          [
            "d2",
            "d4"
          ]
        ]
      },
      {
        "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "say": "Commence par le coup le plus joué au monde : le pion en e4.",
        "task": {
          "from": "e2",
          "to": "e4"
        },
        "arrows": [
          [
            "e2",
            "e4"
          ]
        ]
      },
      {
        "fen": "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
        "say": "Les noirs ont répondu e5. Développe : sors le cavalier en f3, où il attaque déjà le pion e5.",
        "task": {
          "from": "g1",
          "to": "f3"
        },
        "arrows": [
          [
            "g1",
            "f3"
          ]
        ]
      }
    ]
  },
  {
    "id": "developpement",
    "sec": 1,
    "title": "Développer ses pièces",
    "sub": "Sortir vite et bien",
    "coach": "nina",
    "icon": "bolt",
    "steps": [
      {
        "fen": "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3",
        "say": "Règle d'or de l'ouverture : sors une pièce nouvelle à chaque coup, plutôt que de rejouer la même. Sors ton fou en c4.",
        "task": {
          "from": "f1",
          "to": "c4"
        },
        "arrows": [
          [
            "f1",
            "c4"
          ]
        ]
      },
      {
        "fen": "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4",
        "say": "Cavaliers et fous dehors, roi bientôt à l'abri : ton ouverture est réussie. Évite de sortir la dame trop tôt, elle serait chassée."
      }
    ]
  },
  {
    "id": "l-couloir",
    "sec": 1,
    "title": "Le mat du couloir",
    "sub": "Le motif le plus rentable",
    "coach": "nina",
    "icon": "mate",
    "steps": [
      {
        "fen": "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1",
        "say": "Ce motif gagne des milliers de parties chaque jour. La tour plonge sur la dernière rangée : mat.",
        "task": {
          "from": "d1",
          "to": "d8"
        },
        "arrows": [
          [
            "d1",
            "d8"
          ]
        ]
      },
      {
        "fen": "6k1/5pp1/7p/8/8/8/5PPP/3R2K1 w - - 0 1",
        "say": "La parade ? Ouvrir une fenêtre à son roi. Ici les noirs ont joué h6 : leur roi respire, Td8 n'est plus mat. Pense à le faire chez toi !"
      }
    ]
  },
  {
    "id": "l-fourchette",
    "sec": 1,
    "title": "La fourchette",
    "sub": "Deux cibles d’un coup",
    "coach": "nina",
    "icon": "bolt",
    "steps": [
      {
        "fen": "3r3k/8/7N/8/8/8/8/6K1 w - - 0 1",
        "say": "Le cavalier est le roi de la fourchette. Trouve la case qui attaque le roi ET la tour.",
        "task": {
          "from": "h6",
          "to": "f7"
        },
        "arrows": [
          [
            "h6",
            "f7"
          ]
        ]
      },
      {
        "fen": "3r1k2/5N2/8/8/8/8/8/6K1 w - - 0 1",
        "say": "Le roi doit parer l'échec — et la tour reste en prise. Le cavalier ramasse la mise au coup suivant.",
        "arrows": [
          [
            "f7",
            "d8"
          ]
        ]
      }
    ]
  },
  {
    "id": "l-clouage",
    "sec": 1,
    "title": "Le clouage",
    "sub": "Une pièce paralysée",
    "coach": "lotus",
    "icon": "bolt",
    "steps": [
      {
        "fen": "4k3/8/2n5/1B6/8/8/8/6K1 b - - 0 1",
        "say": "Le fou blanc vise le roi noir à travers le cavalier. Résultat : ce cavalier est cloué, il ne peut plus bouger du tout.",
        "arrows": [
          [
            "b5",
            "e8"
          ]
        ]
      },
      {
        "fen": "4k3/8/2n5/1B6/8/8/8/6K1 b - - 0 1",
        "say": "Essaie de bouger le cavalier en c6 : tu verras qu'aucune case ne s'allume. Une pièce clouée est une pièce en moins."
      }
    ]
  },
  {
    "id": "l-enfilade",
    "sec": 1,
    "title": "L’enfilade",
    "sub": "Frapper à travers le roi",
    "coach": "nina",
    "icon": "bolt",
    "steps": [
      {
        "fen": "8/4q3/8/8/4k3/8/8/R5K1 w - - 0 1",
        "say": "Roi et dame noirs sont sur la même colonne. Mets le roi en échec : il devra s'écarter et livrer la dame.",
        "task": {
          "from": "a1",
          "to": "e1"
        },
        "arrows": [
          [
            "a1",
            "e1"
          ]
        ]
      },
      {
        "fen": "8/4q3/8/8/3k4/8/8/4R1K1 w - - 0 1",
        "say": "Le roi s'est écarté — la dame est maintenant sans protection au bout de la colonne. C'est l'enfilade : le contraire du clouage.",
        "arrows": [
          [
            "e1",
            "e7"
          ]
        ]
      }
    ]
  },
  {
    "id": "l-decouverte",
    "sec": 1,
    "title": "L’attaque à la découverte",
    "sub": "Deux menaces d’un coup",
    "coach": "lotus",
    "icon": "bolt",
    "steps": [
      {
        "fen": "4k3/1q6/8/8/4B3/8/8/4R1K1 w - - 0 1",
        "say": "Ta tour vise le roi noir, mais ton propre fou lui bloque la route. Déplace le fou en capturant la dame !",
        "task": {
          "from": "e4",
          "to": "b7"
        },
        "arrows": [
          [
            "e4",
            "b7"
          ]
        ]
      },
      {
        "fen": "4k3/1B6/8/8/8/8/8/4R1K1 b - - 0 1",
        "say": "Un seul coup, deux effets : le fou a pris la dame, et la tour donne échec. Les noirs doivent parer l'échec — la dame est déjà perdue.",
        "arrows": [
          [
            "e1",
            "e8"
          ]
        ]
      }
    ]
  },
  {
    "id": "l-echange",
    "sec": 1,
    "title": "Quand échanger",
    "sub": "Simplifier à bon escient",
    "coach": "lotus",
    "icon": "bolt",
    "steps": [
      {
        "fen": "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4",
        "say": "Règle simple : échange quand tu as plus de matériel, évite quand tu en as moins. Avec un avantage, chaque échange te rapproche du gain."
      },
      {
        "fen": "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4",
        "say": "Évite aussi d'échanger tes pièces actives contre des pièces adverses passives. Une bonne pièce vaut mieux que deux endormies."
      }
    ]
  },
  {
    "id": "l-mat-dame",
    "sec": 2,
    "title": "Mater avec la dame",
    "sub": "La technique du roi et de la dame",
    "coach": "lotus",
    "icon": "mate",
    "steps": [
      {
        "fen": "7k/8/6K1/8/8/8/8/1Q6 w - - 0 1",
        "say": "Ton roi couvre déjà g7 et h7. Il ne reste qu'à donner l'échec sur la dernière rangée.",
        "arrowsFrom": "b1"
      },
      {
        "fen": "7k/8/6K1/8/8/8/8/1Q6 w - - 0 1",
        "say": "Joue Db8 : échec, et aucune case de fuite. Retiens la méthode : d'abord le roi, ensuite la dame.",
        "task": {
          "from": "b1",
          "to": "b8"
        },
        "arrows": [
          [
            "b1",
            "b8"
          ]
        ]
      }
    ]
  },
  {
    "id": "l-tour7",
    "sec": 2,
    "title": "La tour sur la 7e",
    "sub": "La rangée qui fait mal",
    "coach": "nina",
    "icon": "r",
    "steps": [
      {
        "fen": "6k1/5pp1/7p/8/8/8/8/R5K1 w - - 0 1",
        "say": "La 7e rangée, c'est là que dorment les pions adverses. Installe ta tour en a7 : elle les attaque tous à la fois.",
        "task": {
          "from": "a1",
          "to": "a7"
        },
        "arrows": [
          [
            "a1",
            "a7"
          ]
        ]
      },
      {
        "fen": "6k1/R4pp1/7p/8/8/8/8/6K1 w - - 0 1",
        "say": "Une tour sur la 7e rangée vaut souvent un pion de plus : elle ratisse les pions et enferme le roi sur sa dernière rangée."
      }
    ]
  },
  {
    "id": "l-roi-actif",
    "sec": 2,
    "title": "Le roi actif",
    "sub": "En finale, le roi attaque",
    "coach": "lotus",
    "icon": "k",
    "steps": [
      {
        "fen": "8/8/4k3/8/8/4K3/8/8 w - - 0 1",
        "say": "Les dames ont disparu : ton roi n'est plus une cible, c'est une pièce de combat. Il faut le centraliser.",
        "arrowsFrom": "e3"
      },
      {
        "fen": "8/8/4k3/8/8/4K3/8/8 w - - 0 1",
        "say": "Avance-le vers le centre, en e4, face au roi adverse.",
        "task": {
          "from": "e3",
          "to": "e4"
        },
        "arrows": [
          [
            "e3",
            "e4"
          ]
        ]
      }
    ]
  },
  {
    "id": "escalier",
    "sec": 2,
    "title": "Mater avec deux tours",
    "sub": "La technique de l’escalier",
    "coach": "lotus",
    "icon": "mate",
    "steps": [
      {
        "fen": "7k/R7/1R6/8/8/8/8/7K w - - 0 1",
        "say": "Deux tours matent seules, sans le roi. Une tour coupe une rangée, l'autre donne l'échec sur la suivante.",
        "arrows": [
          [
            "b6",
            "b8"
          ]
        ]
      },
      {
        "fen": "7k/R7/1R6/8/8/8/8/7K w - - 0 1",
        "say": "Joue Tb8 : le roi n'a plus de rangée où fuir. Mat !",
        "task": {
          "from": "b6",
          "to": "b8"
        },
        "arrows": [
          [
            "b6",
            "b8"
          ]
        ]
      }
    ]
  },
  {
    "id": "opposition",
    "sec": 2,
    "title": "L’opposition",
    "sub": "Le duel des rois",
    "coach": "lotus",
    "icon": "bolt",
    "steps": [
      {
        "fen": "8/8/8/4k3/8/4K3/4P3/8 w - - 0 1",
        "say": "En finale, les rois se font face. Celui qui NE doit PAS jouer a l'avantage : c'est l'opposition.",
        "arrowsFrom": "e3"
      },
      {
        "fen": "8/8/8/4k3/8/4K3/4P3/8 w - - 0 1",
        "say": "Ne pousse pas le pion trop tôt ! Le roi doit passer devant. Cette technique gagne des finales entières."
      }
    ]
  },
  {
    "id": "passe",
    "sec": 2,
    "title": "Le pion passé",
    "sub": "L’atout des finales",
    "coach": "nina",
    "icon": "p",
    "steps": [
      {
        "fen": "8/8/8/1P5p/8/8/8/K5k1 w - - 0 1",
        "say": "Aucun pion noir ne peut arrêter ce pion b : il est « passé ». En finale, c'est souvent décisif.",
        "arrowsFrom": "b5"
      },
      {
        "fen": "8/8/8/1P5p/8/8/8/K5k1 w - - 0 1",
        "say": "Fais-le avancer ! Chaque pas le rapproche de la promotion.",
        "task": {
          "from": "b5",
          "to": "b6"
        },
        "arrows": [
          [
            "b5",
            "b6"
          ]
        ]
      }
    ]
  }
];

export const PUZZLES: Puzzle[] = [
  {
    "id": "dame-roi",
    "theme": "Mat dame et roi",
    "rating": 600,
    "fen": "7k/8/6K1/8/8/8/8/1Q6 w - - 0 1",
    "line": [
      [
        "b1",
        "b8"
      ]
    ],
    "hint": "Approche ta dame, mais garde-la protégée par ton roi.",
    "desc": "La dame vient au contact du roi adverse, protégée par son propre roi. Aucune fuite possible : mat.",
    "mate": true,
    "gain": 0
  },
  {
    "id": "escalier",
    "theme": "Mat de l’escalier",
    "rating": 700,
    "fen": "7k/R7/1R6/8/8/8/8/7K w - - 0 1",
    "line": [
      [
        "b6",
        "b8"
      ]
    ],
    "hint": "Tes deux tours se relaient rangée après rangée.",
    "desc": "Une tour coupe la 7e rangée, l'autre donne échec sur la 8e. C'est la technique de l'escalier, le mat de base à connaître.",
    "mate": true,
    "gain": 0
  },
  {
    "id": "tour-roi",
    "theme": "Mat tour et roi",
    "rating": 700,
    "fen": "7k/8/6K1/8/8/8/8/R7 w - - 0 1",
    "line": [
      [
        "a1",
        "a8"
      ]
    ],
    "hint": "Ton roi contrôle les cases de fuite, la tour donne l'échec.",
    "desc": "Le roi blanc couvre les cases d'évasion, la tour donne l'échec sur la dernière rangée. Le mat élémentaire tour + roi.",
    "mate": true,
    "gain": 0
  },
  {
    "id": "mat-dame-c",
    "theme": "Mat de la dame",
    "rating": 700,
    "fen": "6k1/5ppp/8/8/8/8/8/1Q4K1 w - - 0 1",
    "line": [
      [
        "b1",
        "b8"
      ]
    ],
    "hint": "Ta dame seule peut atteindre la dernière rangée.",
    "desc": "La dame plonge sur la 8e rangée. Les pions censés protéger le roi l'enferment : mat.",
    "mate": true,
    "gain": 0
  },
  {
    "id": "dame-couloir",
    "theme": "Mat du couloir",
    "rating": 750,
    "fen": "6k1/5ppp/8/8/8/8/5PPP/1Q4K1 w - - 0 1",
    "line": [
      [
        "b1",
        "b8"
      ]
    ],
    "hint": "Ta dame peut atteindre la dernière rangée.",
    "desc": "La dame plonge sur la 8e rangée. Les pions qui devaient protéger le roi l'emprisonnent : mat.",
    "mate": true,
    "gain": 0
  },
  {
    "id": "esc-b",
    "theme": "Mat de l’escalier",
    "rating": 750,
    "fen": "7k/8/8/8/8/8/R7/1R5K w - - 0 1",
    "line": [
      [
        "b1",
        "g1"
      ],
      [
        "h8",
        "h7"
      ],
      [
        "a2",
        "h2"
      ]
    ],
    "hint": "Fais coopérer tes deux tours, rangée après rangée.",
    "desc": "Une tour coupe une rangée, l'autre donne l'échec : c'est l'escalier, le mat de base à deux tours.",
    "mate": true,
    "gain": 0
  },
  {
    "id": "couloir",
    "theme": "Mat du couloir",
    "rating": 800,
    "fen": "6k1/5ppp/8/8/8/8/8/3R2K1 w - - 0 1",
    "line": [
      [
        "d1",
        "d8"
      ]
    ],
    "hint": "Le roi est enfermé par ses propres pions. Utilise la dernière rangée.",
    "desc": "La tour s'engouffre sur la 8e rangée. Le roi, bloqué par son propre mur de pions, n'a aucune case : échec et mat.",
    "mate": true,
    "gain": 0
  },
  {
    "id": "promotion",
    "theme": "Promotion",
    "rating": 850,
    "fen": "8/1P6/2k5/8/8/8/8/6K1 w - - 0 1",
    "line": [
      [
        "b7",
        "b8",
        "Q"
      ],
      [
        "c6",
        "d7"
      ],
      [
        "g1",
        "h1"
      ],
      [
        "d7",
        "e7"
      ],
      [
        "h1",
        "h2"
      ],
      [
        "e7",
        "f7"
      ]
    ],
    "hint": "Ton pion touche au but — mais le roi noir approche.",
    "desc": "Il faut promouvoir immédiatement : tout autre coup laisse le roi noir capturer le pion. La nouvelle dame décide la partie.",
    "mate": false,
    "gain": 8
  },
  {
    "id": "tour-dame",
    "theme": "Gain de la dame",
    "rating": 850,
    "fen": "3q4/8/8/8/8/8/8/3R2K1 w - - 0 1",
    "line": [
      [
        "d1",
        "d8"
      ]
    ],
    "hint": "Ta tour et la dame noire partagent quelque chose.",
    "desc": "Les deux pièces sont sur la même colonne : la tour capture simplement la dame, qui n'est pas défendue.",
    "mate": false,
    "gain": 9
  },
  {
    "id": "couloir-prise",
    "theme": "Mat du couloir",
    "rating": 900,
    "fen": "3r2k1/5ppp/8/8/8/8/5PPP/2RR2K1 w - - 0 1",
    "line": [
      [
        "d1",
        "d8"
      ]
    ],
    "hint": "Élimine le défenseur de la dernière rangée.",
    "desc": "La tour capture le dernier défenseur et occupe la 8e rangée : le roi est mat derrière ses pions.",
    "mate": true,
    "gain": 5
  },
  {
    "id": "fourch-tour",
    "theme": "Fourchette",
    "rating": 900,
    "fen": "3r3k/8/7N/8/8/8/8/6K1 w - - 0 1",
    "line": [
      [
        "h6",
        "f7"
      ],
      [
        "h8",
        "g8"
      ],
      [
        "f7",
        "d8"
      ],
      [
        "g8",
        "h8"
      ],
      [
        "d8",
        "f7"
      ],
      [
        "h8",
        "g8"
      ]
    ],
    "hint": "Cherche un saut de cavalier qui attaque deux pièces à la fois.",
    "desc": "Le cavalier attaque le roi et la tour en même temps. Le roi doit parer l'échec, et la tour tombe.",
    "mate": false,
    "gain": 5
  },
  {
    "id": "rayons-x",
    "theme": "Mat du couloir",
    "rating": 900,
    "fen": "3r2k1/5ppp/8/8/8/8/5PPP/3RR1K1 w - - 0 1",
    "line": [
      [
        "d1",
        "d8"
      ]
    ],
    "hint": "Deux tours valent mieux qu'une sur la dernière rangée.",
    "desc": "La première tour capture le défenseur, la seconde soutient l'invasion : mat sur la dernière rangée.",
    "mate": true,
    "gain": 5
  },
  {
    "id": "gen4",
    "theme": "Promotion",
    "rating": 900,
    "fen": "8/3p2P1/6kN/8/5r2/8/3p4/1K3B2 w - - 0 1",
    "line": [
      [
        "g7",
        "g8",
        "Q"
      ],
      [
        "g6",
        "h6"
      ],
      [
        "g8",
        "h8"
      ],
      [
        "h6",
        "g6"
      ],
      [
        "f1",
        "d3"
      ]
    ],
    "hint": "Ton pion peut changer de vie.",
    "desc": "Le pion atteint la dernière rangée et se transforme : le matériel décide la partie.",
    "mate": false,
    "gain": 5
  },
  {
    "id": "promo-c",
    "theme": "Promotion",
    "rating": 900,
    "fen": "8/4P1k1/8/8/8/8/6K1/8 w - - 0 1",
    "line": [
      [
        "e7",
        "e8",
        "Q"
      ],
      [
        "g7",
        "h7"
      ],
      [
        "g2",
        "h2"
      ],
      [
        "h7",
        "g7"
      ],
      [
        "h2",
        "h3"
      ],
      [
        "g7",
        "h7"
      ]
    ],
    "hint": "Ton pion touche au but, et le roi noir est trop loin.",
    "desc": "Le pion se transforme en dame : avec une dame de plus, la finale est gagnée d'office.",
    "mate": false,
    "gain": 8
  },
  {
    "id": "fourch-roi",
    "theme": "Fourchette",
    "rating": 950,
    "fen": "k1r5/8/8/8/2N5/8/8/6K1 w - - 0 1",
    "line": [
      [
        "c4",
        "b6"
      ],
      [
        "a8",
        "b8"
      ],
      [
        "b6",
        "c8"
      ],
      [
        "b8",
        "c8"
      ],
      [
        "g1",
        "h1"
      ],
      [
        "c8",
        "d8"
      ]
    ],
    "hint": "Un seul saut attaque le roi et la tour.",
    "desc": "Le cavalier bondit et fourche le roi et la tour. Le roi bouge, le cavalier emporte la tour.",
    "mate": false,
    "gain": 2
  },
  {
    "id": "gen1",
    "theme": "Fourchette",
    "rating": 950,
    "fen": "4R3/6b1/3k4/8/7N/2P2K2/b7/8 w - - 0 1",
    "line": [
      [
        "h4",
        "f5"
      ],
      [
        "d6",
        "c6"
      ],
      [
        "f5",
        "g7"
      ],
      [
        "a2",
        "b3"
      ],
      [
        "g7",
        "f5"
      ]
    ],
    "hint": "Une pièce attaque deux cibles à la fois — laquelle ?",
    "desc": "Le coup crée une fourchette : deux pièces attaquées simultanément, l'adversaire ne peut en sauver qu'une.",
    "mate": false,
    "gain": 4
  },
  {
    "id": "gen5",
    "theme": "Double attaque",
    "rating": 950,
    "fen": "2K5/8/3q4/8/B7/2b4k/8/4R3 w - - 0 1",
    "line": [
      [
        "e1",
        "e3"
      ],
      [
        "h3",
        "h4"
      ],
      [
        "e3",
        "c3"
      ],
      [
        "d6",
        "b4"
      ],
      [
        "c3",
        "c6"
      ]
    ],
    "hint": "Cherche le coup qui menace deux choses en même temps.",
    "desc": "Une double attaque : deux menaces d'un coup, impossibles à parer toutes les deux.",
    "mate": false,
    "gain": 3
  },
  {
    "id": "gen9",
    "theme": "Fourchette",
    "rating": 950,
    "fen": "3K4/8/2b1p3/8/6N1/BN6/2k5/5n2 w - - 0 1",
    "line": [
      [
        "b3",
        "d4"
      ],
      [
        "c2",
        "d3"
      ],
      [
        "d4",
        "c6"
      ],
      [
        "d3",
        "e4"
      ],
      [
        "a3",
        "c1"
      ]
    ],
    "hint": "Une pièce attaque deux cibles à la fois — laquelle ?",
    "desc": "Le coup crée une fourchette : deux pièces attaquées simultanément, l'adversaire ne peut en sauver qu'une.",
    "mate": false,
    "gain": 3
  },
  {
    "id": "enfilade",
    "theme": "Enfilade",
    "rating": 1000,
    "fen": "8/4q3/8/8/4k3/8/8/R5K1 w - - 0 1",
    "line": [
      [
        "a1",
        "e1"
      ],
      [
        "e4",
        "f4"
      ],
      [
        "e1",
        "e7"
      ],
      [
        "f4",
        "g4"
      ],
      [
        "g1",
        "h1"
      ],
      [
        "g4",
        "h4"
      ]
    ],
    "hint": "Mets le roi en échec sur une ligne où la dame se cache derrière lui.",
    "desc": "La tour met le roi en échec ; en s'écartant, il découvre la dame placée derrière lui, qui est capturée. C'est l'enfilade.",
    "mate": false,
    "gain": 9
  },
  {
    "id": "skewer-fou",
    "theme": "Gain de la dame",
    "rating": 1000,
    "fen": "7k/6q1/8/4B3/8/8/8/6K1 w - - 0 1",
    "line": [
      [
        "e5",
        "g7"
      ],
      [
        "h8",
        "g7"
      ],
      [
        "g1",
        "h1"
      ],
      [
        "g7",
        "h7"
      ],
      [
        "h1",
        "h2"
      ],
      [
        "h7",
        "h8"
      ]
    ],
    "hint": "Ton fou peut frapper une pièce bien plus précieuse que lui.",
    "desc": "Le fou capture la dame. Même repris, l'échange est largement gagnant : un fou contre une dame.",
    "mate": false,
    "gain": 6
  },
  {
    "id": "gen6",
    "theme": "Promotion",
    "rating": 1000,
    "fen": "8/1n3P2/1k4N1/8/8/2b5/B7/3K4 w - - 0 1",
    "line": [
      [
        "f7",
        "f8",
        "Q"
      ],
      [
        "c3",
        "a5"
      ],
      [
        "f8",
        "b8"
      ],
      [
        "a5",
        "c3"
      ],
      [
        "a2",
        "d5"
      ]
    ],
    "hint": "Ton pion peut changer de vie.",
    "desc": "Le pion atteint la dernière rangée et se transforme : le matériel décide la partie.",
    "mate": false,
    "gain": 8
  },
  {
    "id": "gen7",
    "theme": "Promotion",
    "rating": 1050,
    "fen": "8/7P/8/5B1R/8/6b1/1k6/2n4K w - - 0 1",
    "line": [
      [
        "h7",
        "h8",
        "Q"
      ],
      [
        "b2",
        "a3"
      ],
      [
        "h8",
        "c3"
      ],
      [
        "a3",
        "a2"
      ],
      [
        "c3",
        "g3"
      ]
    ],
    "hint": "Ton pion peut changer de vie.",
    "desc": "Le pion atteint la dernière rangée et se transforme : le matériel décide la partie.",
    "mate": false,
    "gain": 11
  },
  {
    "id": "dame-cav",
    "theme": "Mat de la dame",
    "rating": 1100,
    "fen": "1k1r4/p7/1pQ2K2/r1N5/8/8/8/8 w - - 0 1",
    "line": [
      [
        "c6",
        "b7"
      ]
    ],
    "hint": "Ta dame peut mater en un coup, avec l'aide du cavalier.",
    "desc": "La dame donne échec au contact, protégée par le cavalier. Le roi n'a plus aucune case : mat.",
    "mate": true,
    "gain": 0
  },
  {
    "id": "decouverte",
    "theme": "Attaque à la découverte",
    "rating": 1150,
    "fen": "4k3/1q6/8/8/4B3/8/8/4R1K1 w - - 0 1",
    "line": [
      [
        "e4",
        "b7"
      ],
      [
        "e8",
        "f8"
      ],
      [
        "e1",
        "f1"
      ],
      [
        "f8",
        "g8"
      ],
      [
        "f1",
        "e1"
      ],
      [
        "g8",
        "h8"
      ]
    ],
    "hint": "Déplace ton fou : que se passe-t-il derrière lui ?",
    "desc": "Le fou capture et libère la ligne de la tour, qui donne échec. Un seul coup, deux menaces : la découverte.",
    "mate": false,
    "gain": 9
  },
  {
    "id": "double-att",
    "theme": "Double attaque",
    "rating": 1150,
    "fen": "7k/8/1n6/8/8/8/5QK1/r7 w - - 0 1",
    "line": [
      [
        "f2",
        "d4"
      ],
      [
        "h8",
        "g8"
      ],
      [
        "d4",
        "a1"
      ],
      [
        "b6",
        "d7"
      ],
      [
        "a1",
        "d4"
      ],
      [
        "d7",
        "f8"
      ]
    ],
    "hint": "Trouve la case d'où ta dame frappe deux cibles.",
    "desc": "La dame attaque deux pièces à la fois. L'adversaire ne peut en sauver qu'une seule.",
    "mate": false,
    "gain": 5
  },
  {
    "id": "etouffe",
    "theme": "Mat étouffé",
    "rating": 1200,
    "fen": "6rk/6pp/7N/8/8/8/8/6K1 w - - 0 1",
    "line": [
      [
        "h6",
        "f7"
      ]
    ],
    "hint": "Une seule pièce peut atteindre ce roi encerclé.",
    "desc": "Le cavalier porte le coup fatal : le roi est totalement étouffé par sa tour et ses pions. C'est le mat étouffé.",
    "mate": true,
    "gain": 0
  },
  {
    "id": "fourch-dame",
    "theme": "Fourchette",
    "rating": 1250,
    "fen": "6k1/5ppp/8/3q1N2/8/8/5PPP/6K1 w - - 0 1",
    "line": [
      [
        "f5",
        "e7"
      ],
      [
        "g8",
        "h8"
      ],
      [
        "e7",
        "d5"
      ],
      [
        "h7",
        "h6"
      ],
      [
        "g1",
        "h1"
      ],
      [
        "h6",
        "h5"
      ]
    ],
    "hint": "Trouve la case d'où ton cavalier attaque le roi et la dame.",
    "desc": "Le cavalier s'installe en fourchette sur le roi et la dame. C'est le motif le plus rentable du cavalier.",
    "mate": false,
    "gain": 9
  },
  {
    "id": "inter",
    "theme": "Interférence",
    "rating": 1250,
    "fen": "4k3/8/8/8/8/8/1r6/K2R4 w - - 0 1",
    "line": [
      [
        "a1",
        "b2"
      ],
      [
        "e8",
        "f8"
      ],
      [
        "d1",
        "e1"
      ],
      [
        "f8",
        "g8"
      ],
      [
        "e1",
        "f1"
      ],
      [
        "g8",
        "h8"
      ]
    ],
    "hint": "Coupe la ligne de la tour noire.",
    "desc": "En s'interposant, la pièce blanche coupe la coordination noire : c'est une interférence.",
    "mate": false,
    "gain": 5
  },
  {
    "id": "deviation",
    "theme": "Déviation",
    "rating": 1300,
    "fen": "6k1/3q1ppp/8/8/Q7/8/5PPP/3R2K1 w - - 0 1",
    "line": [
      [
        "a4",
        "a8"
      ],
      [
        "d7",
        "e8"
      ],
      [
        "a8",
        "e8"
      ]
    ],
    "hint": "Attire la dame noire sur une case où elle ne défend plus rien.",
    "desc": "La dame blanche s'offre pour attirer la défense hors de sa case : la dernière rangée s'effondre et le mat tombe.",
    "mate": true,
    "gain": 9
  },
  {
    "id": "anastasie",
    "theme": "Mat d’Anastasie",
    "rating": 1300,
    "fen": "8/4N1pk/8/R7/8/8/8/6K1 w - - 0 1",
    "line": [
      [
        "a5",
        "h5"
      ]
    ],
    "hint": "Le cavalier verrouille la fuite du roi. Amène ta tour sur la colonne h.",
    "desc": "Mat d'Anastasie : le cavalier en e7 couvre g6 et g8, la tour donne l'échec sur la colonne h. Le roi est pris au piège.",
    "mate": true,
    "gain": 0
  },
  {
    "id": "gen8",
    "theme": "Mat en un",
    "rating": 1400,
    "fen": "1Q6/4k3/4n1K1/8/n7/2B5/5R2/8 w - - 0 1",
    "line": [
      [
        "f2",
        "f7"
      ]
    ],
    "hint": "Le mat est là, en un seul coup.",
    "desc": "Échec et mat immédiat : le roi n'a ni fuite, ni parade, ni blocage.",
    "mate": true,
    "gain": 0
  },
  {
    "id": "gen2",
    "theme": "Mat en un",
    "rating": 1500,
    "fen": "6Q1/8/r3p2K/8/8/7k/7P/8 w - - 0 1",
    "line": [
      [
        "g8",
        "g3"
      ]
    ],
    "hint": "Le mat est là, en un seul coup.",
    "desc": "Échec et mat immédiat : le roi n'a ni fuite, ni parade, ni blocage.",
    "mate": true,
    "gain": 0
  },
  {
    "id": "gen3",
    "theme": "Double attaque",
    "rating": 1550,
    "fen": "5b2/8/8/1R2K3/8/2k5/3b2Q1/6Qr w - - 0 1",
    "line": [
      [
        "g1",
        "d4"
      ],
      [
        "c3",
        "c2"
      ],
      [
        "g2",
        "d2"
      ]
    ],
    "hint": "Cherche le coup qui menace deux choses en même temps.",
    "desc": "Une double attaque : deux menaces d'un coup, impossibles à parer toutes les deux.",
    "mate": true,
    "gain": 3
  }
];

/**
 * Niveaux proposés pour l'adversaire Stockfish.
 *
 * Les bornes sont celles du moteur lui-même : il refuse de descendre sous
 * 1320, et c'est justement pourquoi les cinq personnages restent utiles pour
 * débuter — aucun réglage de Stockfish ne les remplace.
 */
export const STOCKFISH_NIVEAUX: { elo: number; nom: string }[] = [
  { elo: 1320, nom: 'Doux' },
  { elo: 1700, nom: 'Solide' },
  { elo: 2100, nom: 'Coriace' },
  { elo: 2600, nom: 'Impitoyable' },
  { elo: 3190, nom: 'Pleine force' },
];

export const BOTS: Bot[] = [
  {
    "id": "pixou",
    "nom": "Pixou",
    "elo": 500,
    "depth": 1,
    "gaffe": 0.55,
    "say": "Je débute, comme toi !"
  },
  {
    "id": "marguerite",
    "nom": "Marguerite",
    "elo": 900,
    "depth": 2,
    "gaffe": 0.22,
    "say": "Un thé, une partie ?"
  },
  {
    "id": "hugo",
    "nom": "Hugo",
    "elo": 1200,
    "depth": 2,
    "gaffe": 0.08,
    "say": "Je joue vite. Suis le rythme."
  },
  {
    "id": "cyrano",
    "nom": "Cyrano",
    "elo": 1500,
    "depth": 3,
    "gaffe": 0.03,
    "say": "L'attaque avant tout !"
  },
  {
    "id": "athena",
    "nom": "Athéna",
    "elo": 1900,
    "depth": 3,
    "gaffe": 0,
    "say": "Montre-moi ce que tu sais."
  },
  {
    "id": "stockfish",
    "nom": "Stockfish",
    "elo": 1600,
    "depth": 3,
    "gaffe": 0,
    "say": "Le vrai moteur. Choisis ta difficulté.",
    "stockfish": true
  }
];

export const OPENINGS: Opening[] = [
  {
    "nom": "Partie italienne",
    "san": "e4 e5 Nf3 Nc6 Bc4",
    "note": "Développement naturel : le fou vise f7, le point faible du roque noir."
  },
  {
    "nom": "Ruy Lopez (espagnole)",
    "san": "e4 e5 Nf3 Nc6 Bb5",
    "note": "Le fou attaque le défenseur du pion e5 et installe une pression durable."
  },
  {
    "nom": "Défense sicilienne",
    "san": "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3",
    "note": "La réponse la plus jouée à 1.e4 : jeu déséquilibré, contre-attaque sur l'aile dame."
  },
  {
    "nom": "Défense française",
    "san": "e4 e6 d4 d5 Nc3",
    "note": "Les noirs heurtent le centre avec d5, au prix d'un fou de cases claires enfermé."
  },
  {
    "nom": "Défense Caro-Kann",
    "san": "e4 c6 d4 d5 Nc3",
    "note": "Solide et sûre : les noirs soutiennent d5 par c6 et gardent une bonne structure."
  },
  {
    "nom": "Gambit dame",
    "san": "d4 d5 c4 e6 Nc3",
    "note": "Les blancs offrent un pion pour ouvrir des lignes et dominer le centre."
  },
  {
    "nom": "Défense est-indienne",
    "san": "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6",
    "note": "Les noirs cèdent le centre puis le contre-attaquent avec e5 ou c5."
  },
  {
    "nom": "Partie anglaise",
    "san": "c4 e5 Nc3 Nf6 g3",
    "note": "Une sicilienne inversée : jeu de position flexible sur les cases claires."
  },
  {
    "nom": "Partie écossaise",
    "san": "e4 e5 Nf3 Nc6 d4 exd4 Nxd4",
    "note": "Les blancs ouvrent le centre tout de suite : jeu clair et pièces actives."
  },
  {
    "nom": "Défense slave",
    "san": "d4 d5 c4 c6 Nf3 Nf6 Nc3",
    "note": "Les noirs soutiennent d5 avec c6 et gardent la diagonale de leur fou dame libre."
  },
  {
    "nom": "Défense nimzo-indienne",
    "san": "d4 Nf6 c4 e6 Nc3 Bb4",
    "note": "Le fou cloue le cavalier c3 et conteste le centre par les pièces plutôt que par les pions."
  },
  {
    "nom": "Défense Pirc",
    "san": "e4 d6 d4 Nf6 Nc3 g6",
    "note": "Les noirs cèdent le centre pour le contre-attaquer depuis un fianchetto solide."
  },
  {
    "nom": "Défense Alekhine",
    "san": "e4 Nf6 e5 Nd5 d4 d6",
    "note": "Provocante : le cavalier invite les pions blancs à avancer pour les prendre ensuite pour cible."
  },
  {
    "nom": "Ouverture Réti",
    "san": "Nf3 d5 c4 e6 g3",
    "note": "Les blancs attaquent le centre depuis les ailes, sans engager leurs propres pions centraux."
  },
  {
    "nom": "Gambit Evans",
    "san": "e4 e5 Nf3 Nc6 Bc4 Bc5 b4",
    "note": "Un pion offert pour gagner du temps et bâtir un centre puissant. Très tranchant."
  },
  {
    "nom": "Défense scandinave",
    "san": "e4 d5 exd5 Qxd5 Nc3 Qa5",
    "note": "Directe et facile à apprendre, au prix de quelques temps avec la dame."
  },
  {
    "nom": "Gambit du roi",
    "san": "e4 e5 f4 exf4 Nf3",
    "note": "Romantique et tranchant : un pion sacrifié pour une attaque immédiate."
  }
];

export const TROPHIES: Trophy[] = [
  {
    "id": "first",
    "name": "Premier pas",
    "art": "seed",
    "desc": "Terminer ta première leçon."
  },
  {
    "id": "movers",
    "name": "Pièces en main",
    "art": "pawn",
    "desc": "Apprendre le déplacement des 6 pièces."
  },
  {
    "id": "tact5",
    "name": "Tacticien",
    "art": "bolt",
    "desc": "Résoudre 5 problèmes."
  },
  {
    "id": "clean3",
    "name": "Sans faute",
    "art": "gem",
    "desc": "Résoudre 3 problèmes d’affilée sans erreur."
  },
  {
    "id": "winai",
    "name": "Échec et mat",
    "art": "crown",
    "desc": "Gagner une partie contre un bot."
  },
  {
    "id": "scholar",
    "name": "Érudit",
    "art": "book",
    "desc": "Terminer toutes les leçons."
  },
  {
    "id": "lvl5",
    "name": "Niveau 5",
    "art": "cup",
    "desc": "Atteindre le niveau 5."
  },
  {
    "id": "allpuz",
    "name": "Collection",
    "art": "medal",
    "desc": "Résoudre tous les problèmes."
  },
  {
    "id": "sprint10",
    "name": "Sprinteur",
    "art": "bolt",
    "desc": "Marquer 10 dans un Sprint."
  },
  {
    "id": "elo1000",
    "name": "Mille",
    "art": "cup",
    "desc": "Atteindre 1000 points de classement."
  },
  {
    "id": "boss",
    "name": "Face à Athéna",
    "art": "crown",
    "desc": "Battre Athéna, le bot le plus fort."
  },
  {
    "id": "curious",
    "name": "Curieux",
    "art": "book",
    "desc": "Rejouer une partie célèbre en entier."
  }
];

export const GAMES: FamousGame[] = [
  {
    "id": "opera",
    "titre": "La partie de l'Opéra",
    "lieu": "Paris, 1858",
    "blancs": "Paul Morphy",
    "noirs": "Duc de Brunswick et Comte Isouard",
    "heros": "w",
    "lecon": "Développer vite, ouvrir les lignes, et faire payer un roi resté au centre.",
    "coups": [
      [
        "e2",
        "e4"
      ],
      [
        "e7",
        "e5"
      ],
      [
        "g1",
        "f3"
      ],
      [
        "d7",
        "d6"
      ],
      [
        "d2",
        "d4"
      ],
      [
        "c8",
        "g4"
      ],
      [
        "d4",
        "e5"
      ],
      [
        "g4",
        "f3"
      ],
      [
        "d1",
        "f3"
      ],
      [
        "d6",
        "e5"
      ],
      [
        "f1",
        "c4"
      ],
      [
        "g8",
        "f6"
      ],
      [
        "f3",
        "b3"
      ],
      [
        "d8",
        "e7"
      ],
      [
        "b1",
        "c3"
      ],
      [
        "c7",
        "c6"
      ],
      [
        "c1",
        "g5"
      ],
      [
        "b7",
        "b5"
      ],
      [
        "c3",
        "b5"
      ],
      [
        "c6",
        "b5"
      ],
      [
        "c4",
        "b5"
      ],
      [
        "b8",
        "d7"
      ],
      [
        "e1",
        "c1"
      ],
      [
        "a8",
        "d8"
      ],
      [
        "d1",
        "d7"
      ],
      [
        "d8",
        "d7"
      ],
      [
        "h1",
        "d1"
      ],
      [
        "e7",
        "e6"
      ],
      [
        "b5",
        "d7"
      ],
      [
        "f6",
        "d7"
      ],
      [
        "b3",
        "b8"
      ],
      [
        "d7",
        "b8"
      ],
      [
        "d1",
        "d8"
      ]
    ]
  },
  {
    "id": "immortelle",
    "titre": "L'Immortelle",
    "lieu": "Londres, 1851",
    "blancs": "Adolf Anderssen",
    "noirs": "Lionel Kieseritzky",
    "heros": "w",
    "lecon": "Donner du matériel sans hésiter quand chaque coup gagne du temps sur le roi adverse.",
    "coups": [
      [
        "e2",
        "e4"
      ],
      [
        "e7",
        "e5"
      ],
      [
        "f2",
        "f4"
      ],
      [
        "e5",
        "f4"
      ],
      [
        "f1",
        "c4"
      ],
      [
        "d8",
        "h4"
      ],
      [
        "e1",
        "f1"
      ],
      [
        "b7",
        "b5"
      ],
      [
        "c4",
        "b5"
      ],
      [
        "g8",
        "f6"
      ],
      [
        "g1",
        "f3"
      ],
      [
        "h4",
        "h6"
      ],
      [
        "d2",
        "d3"
      ],
      [
        "f6",
        "h5"
      ],
      [
        "f3",
        "h4"
      ],
      [
        "h6",
        "g5"
      ],
      [
        "h4",
        "f5"
      ],
      [
        "c7",
        "c6"
      ],
      [
        "g2",
        "g4"
      ],
      [
        "h5",
        "f6"
      ],
      [
        "h1",
        "g1"
      ],
      [
        "c6",
        "b5"
      ],
      [
        "h2",
        "h4"
      ],
      [
        "g5",
        "g6"
      ],
      [
        "h4",
        "h5"
      ],
      [
        "g6",
        "g5"
      ],
      [
        "d1",
        "f3"
      ],
      [
        "f6",
        "g8"
      ],
      [
        "c1",
        "f4"
      ],
      [
        "g5",
        "f6"
      ],
      [
        "b1",
        "c3"
      ],
      [
        "f8",
        "c5"
      ],
      [
        "c3",
        "d5"
      ],
      [
        "f6",
        "b2"
      ],
      [
        "f4",
        "d6"
      ],
      [
        "c5",
        "g1"
      ],
      [
        "e4",
        "e5"
      ],
      [
        "b2",
        "a1"
      ],
      [
        "f1",
        "e2"
      ],
      [
        "b8",
        "a6"
      ],
      [
        "f5",
        "g7"
      ],
      [
        "e8",
        "d8"
      ],
      [
        "f3",
        "f6"
      ],
      [
        "g8",
        "f6"
      ],
      [
        "d6",
        "e7"
      ]
    ]
  },
  {
    "id": "siecle",
    "titre": "La partie du siècle",
    "lieu": "New York, 1956",
    "blancs": "Donald Byrne",
    "noirs": "Bobby Fischer (13 ans)",
    "heros": "b",
    "lecon": "Un joueur de treize ans donne sa dame : la position vaut parfois plus que le matériel.",
    "coups": [
        [
          "g1",
          "f3"
        ],
        [
          "g8",
          "f6"
        ],
        [
          "c2",
          "c4"
        ],
        [
          "g7",
          "g6"
        ],
        [
          "b1",
          "c3"
        ],
        [
          "f8",
          "g7"
        ],
        [
          "d2",
          "d4"
        ],
        [
          "e8",
          "g8"
        ],
        [
          "c1",
          "f4"
        ],
        [
          "d7",
          "d5"
        ],
        [
          "d1",
          "b3"
        ],
        [
          "d5",
          "c4"
        ],
        [
          "b3",
          "c4"
        ],
        [
          "c7",
          "c6"
        ],
        [
          "e2",
          "e4"
        ],
        [
          "b8",
          "d7"
        ],
        [
          "a1",
          "d1"
        ],
        [
          "d7",
          "b6"
        ],
        [
          "c4",
          "c5"
        ],
        [
          "c8",
          "g4"
        ],
        [
          "f4",
          "g5"
        ],
        [
          "b6",
          "a4"
        ],
        [
          "c5",
          "a3"
        ],
        [
          "a4",
          "c3"
        ],
        [
          "b2",
          "c3"
        ],
        [
          "f6",
          "e4"
        ],
        [
          "g5",
          "e7"
        ],
        [
          "d8",
          "b6"
        ],
        [
          "f1",
          "c4"
        ],
        [
          "e4",
          "c3"
        ],
        [
          "e7",
          "c5"
        ],
        [
          "f8",
          "e8"
        ],
        [
          "e1",
          "f1"
        ],
        [
          "g4",
          "e6"
        ],
        [
          "c5",
          "b6"
        ],
        [
          "e6",
          "c4"
        ],
        [
          "f1",
          "g1"
        ],
        [
          "c3",
          "e2"
        ],
        [
          "g1",
          "f1"
        ],
        [
          "e2",
          "d4"
        ],
        [
          "f1",
          "g1"
        ],
        [
          "d4",
          "e2"
        ],
        [
          "g1",
          "f1"
        ],
        [
          "e2",
          "c3"
        ],
        [
          "f1",
          "g1"
        ],
        [
          "a7",
          "b6"
        ],
        [
          "a3",
          "b4"
        ],
        [
          "a8",
          "a4"
        ],
        [
          "b4",
          "b6"
        ],
        [
          "c3",
          "d1"
        ],
        [
          "h2",
          "h3"
        ],
        [
          "a4",
          "a2"
        ],
        [
          "g1",
          "h2"
        ],
        [
          "d1",
          "f2"
        ],
        [
          "h1",
          "e1"
        ],
        [
          "e8",
          "e1"
        ],
        [
          "b6",
          "d8"
        ],
        [
          "g7",
          "f8"
        ],
        [
          "f3",
          "e1"
        ],
        [
          "c4",
          "d5"
        ],
        [
          "e1",
          "f3"
        ],
        [
          "f2",
          "e4"
        ],
        [
          "d8",
          "b8"
        ],
        [
          "b7",
          "b5"
        ],
        [
          "h3",
          "h4"
        ],
        [
          "h7",
          "h5"
        ],
        [
          "f3",
          "e5"
        ],
        [
          "g8",
          "g7"
        ],
        [
          "h2",
          "g1"
        ],
        [
          "f8",
          "c5"
        ],
        [
          "g1",
          "f1"
        ],
        [
          "e4",
          "g3"
        ],
        [
          "f1",
          "e1"
        ],
        [
          "c5",
          "b4"
        ],
        [
          "e1",
          "d1"
        ],
        [
          "d5",
          "b3"
        ],
        [
          "d1",
          "c1"
        ],
        [
          "g3",
          "e2"
        ],
        [
          "c1",
          "b1"
        ],
        [
          "e2",
          "c3"
        ],
        [
          "b1",
          "c1"
        ],
        [
          "a2",
          "c2"
        ]
      ]
  }
];
