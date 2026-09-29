# Adversaires : pourquoi ils jouaient « sans réfléchir », et ce qui a changé

## Le constat

Retour d'utilisation : beaucoup de coups de l'adversaire paraissaient irréfléchis, avec des pièces qui
revenaient souvent à leur case d'origine.

## Les causes (mesurées dans le code, pas supposées)

1. **Recherche trop courte.** L'ancien moteur (`ai.ts`) cherchait 1 à 3 demi-coups, sans recherche de
   quiétude : il ne voyait pas les reprises, donc « gagnait » des pièces défendues et en perdait en retour.
2. **Évaluation aveugle aux coups tranquilles.** Seuls les pions et les cavaliers avaient une table de
   positions. Pour tout autre coup silencieux, les scores étaient égaux, et le choix se faisait au hasard :
   d'où les allers-retours.
3. **La faiblesse était du hasard pur.** Un pourcentage de « gaffes » jouait un coup tiré au sort,
   sans rapport avec la position.

## Ce qui remplace tout cela (`src/chess/brain/`)

- **Un vrai moteur** : plateau à make/unmake, hachage de Zobrist, approfondissement itératif, PVS, table
  de transposition, recherche de quiétude, coup nul, réductions tardives, coups « killer » et historique,
  évaluation à phases avec tables de cases pour toutes les pièces, finales gagnantes guidées.
  Validé par `perft` et par comparaison avec l'ancien générateur de coups. Environ 1,5 million de
  nœuds/s sous Node ; profondeur 6 depuis la position initiale en ~260 ms.
- **Une faiblesse humaine, pas aléatoire** : les faibles cherchent moins profond et voient moins de
  reprises (`qmax`), choisissent parmi les coups proches du meilleur avec un tirage pondéré
  (`temperature`), et se « distraient » parfois (ne voient plus les reprises). Jamais de coup tiré au sort.
- **Contre le va-et-vient** : annuler le coup précédent est pénalisé (−45 cp), rejouer la même pièce en
  ouverture aussi (−14 cp).
- **Le répertoire d'ouvertures** (`partLivre`) passe avant la recherche ; Stockfish (web, dès 1 320 Elo)
  prend le relais pour les niveaux « Stockfish ».

## Calibration : ce qui est mesuré

Parties contre Stockfish bridé (`UCI_LimitStrength` / `UCI_Elo`), 100 ms par coup, sous Node.

| Adversaire | Étiquette | Estimation mesurée | Comment |
|---|---|---|---|
| Pixou | 500 | ≈ 430 | chaîne de matchs entre bots (Pixou–Marguerite–Hugo) |
| Marguerite | 900 | ≈ 850 | idem |
| Hugo | 1200 | ≈ 1130 | 4V 0N 12D contre SF 1320 |
| Cyrano | 1500 | ≈ 1360 | 7V 4N 5D contre SF 1320 |
| Athéna | 1900 | non remesuré au réglage final | essais sur des réglages voisins : 1 735–2 035 contre SF 1700/2000 |

À retenir : **l'ancien « Cyrano » 1500 valait en réalité ≈ 1276** contre le même adversaire ; les
étiquettes de l'ancienne version étaient trop généreuses.

### Perte moyenne par coup (Stockfish profondeur 9, ~230 coups par bot)

| Bot | Ancien : perte moy. / gaffes > 200 cp | Nouveau : perte moy. / gaffes > 200 cp |
|---|---|---|
| Pixou | 122 cp / 19,6 % | 104 cp / 13,2 % |
| Marguerite | 110 cp / 17,9 % | 98 cp / 12,0 % |
| Hugo | 103 cp / 15,3 % | 67 cp / 3,9 % |
| Cyrano | 99 cp / 17,3 % | 63–67 cp / 4,2–5,3 % (deux mesures) |

Athéna : non mesurée à ce jour.

## Ce qui n'a PAS été démontré

- Le taux de va-et-vient mesuré passe de 2–3 % à 1–2 % : c'est **peu**. L'impression de coups
  « irréfléchis » venait surtout de la qualité des coups (gaffes, coups sans plan), pas d'un vrai
  taux de retours élevé. L'amélioration se voit sur la perte moyenne et les gaffes, ci-dessus.
- Les estimations Elo ont une marge d'environ ±100 à ±150 (16 parties par mesure), sont relatives à
  Stockfish à 100 ms et à l'échelle `UCI_Elo` de Stockfish (proche de CCRL, pas de chess.com).
  **Ne pas les présenter comme des classements chess.com ou FIDE.**
- Rien n'a été vérifié sur iPhone Safari : la vitesse du cerveau y dépend de l'appareil.
