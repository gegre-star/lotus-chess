/**
 * Les erreurs de contenu trouvées à l'audit d'un maître FIDE, une par une.
 *
 * Chaque test nomme le constat (F1…F11 pour les erreurs factuelles, puis les
 * défauts trompeurs) et vérifie *ce qui était faux*, pas seulement que le
 * texte a changé : la position, le coup, la réponse adverse, le matériel
 * restant. C'est ce qui rend l'erreur impossible à réintroduire par un
 * changement de FEN ou de formulation. Les constats sur les exercices (F11) et
 * les finales roi-et-pion (F8) vivent dans `preuves-exercices.test.ts`, où
 * sont les preuves de Stockfish et le solveur exact qu'ils réclament.
 */
import { Cerveau } from '../brain/cerveau';
import { LESSONS, OPENINGS, PUZZLES } from '../content';
import { EXERCISES } from '../exercises';
import { LIGNES, nommerOuverture } from '../ouvertures';
import {
  findMove,
  gameStatus,
  inCheck,
  insufficientMaterial,
  isAttacked,
  legalMoves,
  makeMove,
  parseFEN,
  playSAN,
  squareFromName as at,
  squareName,
  toFEN,
  type Move,
  type Position,
} from '../engine';

const lecon = (id: string) => LESSONS.find((l) => l.id === id)!;
const etape = (id: string, i: number) => lecon(id).steps[i];
const probleme = (id: string) => PUZZLES.find((p) => p.id === id)!;
const exercice = (id: string) => EXERCISES.find((e) => e.id === id)!;

const uci = (m: Move): string => `${squareName(m.from)}${squareName(m.to)}${m.promotion ? m.promotion.toLowerCase() : ''}`;
const placement = (fen: string): string => fen.split(' ')[0];

/** Joue un coup en notation UCI depuis un FEN, en échouant s'il est illégal. */
function jouer(fen: string, coup: string): Position {
  const pos = parseFEN(fen);
  const m = findMove(pos, at(coup.slice(0, 2)), at(coup.slice(2, 4)), coup[4] ? (coup[4].toUpperCase() as 'Q') : undefined);
  if (!m) throw new Error(`${coup} est illégal dans ${fen}`);
  return makeMove(pos, m);
}

/** Joue la ligne officielle d'un problème. */
function jouerLigne(fen: string, ligne: readonly (readonly string[])[]): Position {
  return ligne.reduce((pos, [de, vers, promo]) => {
    const m = findMove(pos, at(de), at(vers), promo as 'Q' | undefined);
    if (!m) throw new Error(`${de}${vers} est illégal`);
    return makeMove(pos, m);
  }, parseFEN(fen));
}

/** Avantage des blancs en centièmes de pion, selon le moteur maison. */
function avantageBlanc(pos: Position, profondeur = 6): number {
  const a = new Cerveau().analyser(pos, { profondeur });
  if (a.mat !== null) return (a.mat > 0 ? 1 : -1) * (pos.turn === 'w' ? 1 : -1) * 100000;
  return (a.cp ?? 0) * (pos.turn === 'w' ? 1 : -1);
}

/** Valeur, pour celui qui le joue, de chaque coup légal d'une position. */
function valeursDesCoups(fen: string, profondeur = 6): Record<string, number> {
  const pos = parseFEN(fen);
  const signe = pos.turn === 'w' ? 1 : -1;
  const out: Record<string, number> = {};
  legalMoves(pos).forEach((m) => {
    out[uci(m)] = signe * avantageBlanc(makeMove(pos, m), profondeur);
  });
  return out;
}

// ---------------------------------------------------------------- FAUX

describe('F1 · leçon « l’échec » : la tour n’est plus offerte', () => {
  test('Ta8+ est un échec que le roi noir ne peut ni prendre ni parer autrement qu’en s’écartant', () => {
    const apres = jouer(etape('echec', 0).fen, 'a1a8');
    expect(inCheck(apres, 'b')).toBe(true);
    // avec la tour en d8 (ancienne position), Rxd8 était possible : la tour était donnée
    legalMoves(apres).forEach((m) => expect(squareName(m.to)).not.toBe('a8'));
    expect(legalMoves(apres).map(uci).sort()).toEqual(['e8d7', 'e8e7', 'e8f7']);
  });

  test('l’étape 2 est bien la position qui suit l’échec, et « Joue-le en e7 » est légal', () => {
    const apres = jouer(etape('echec', 0).fen, 'a1a8');
    expect(placement(etape('echec', 1).fen)).toBe(placement(toFEN(apres)));
    expect(etape('echec', 1).task).toEqual({ from: 'e8', to: 'e7' });
    const suite = jouer(etape('echec', 1).fen, 'e8e7');
    expect(placement(etape('echec', 2).fen)).toBe(placement(toFEN(suite)));
  });
});

describe('F2 · leçon « le pat » : un seul mat, et le piège est le pat', () => {
  const fen = () => etape('pat', 1).fen;

  test('un seul coup mate — l’ancien texte promettait « n’importe quoi = pat » alors que quatre coups mataient', () => {
    const pos = parseFEN(fen());
    const mats = legalMoves(pos).filter((m) => gameStatus(makeMove(pos, m)) === 'mate');
    expect(mats.map(uci)).toEqual(['g1g7']);
  });

  test('Dg6, le piège cité par le texte, est bien un pat', () => {
    expect(gameStatus(jouer(fen(), 'g1g6'))).toBe('stalemate');
    expect(etape('pat', 1).say).toMatch(/Dg6/);
    expect(etape('pat', 1).say).toMatch(/pat/);
    expect(etape('pat', 1).say).not.toMatch(/n'importe quoi/);
  });

  test('la tâche est ce mat unique', () => {
    expect(etape('pat', 1).task).toEqual({ from: 'g1', to: 'g7' });
  });
});

describe('F3 · la fourchette de cavalier ne finit plus en nulle automatique', () => {
  test('le problème « fourch-tour » gagne une tour et garde du matériel pour mater', () => {
    const p = probleme('fourch-tour');
    const fin = jouerLigne(p.fen, p.line);
    expect(insufficientMaterial(fin)).toBe(false);
    // et Cf7+ n'a qu'une réponse : le roi doit aller en g8, le texte de la leçon en dépend
    const apresEchec = jouer(p.fen, 'h6f7');
    expect(legalMoves(apresEchec).map(uci)).toEqual(['h8g8']);
  });

  test('la leçon : l’étape 2 est la position qui suit Cf7+ Rg8', () => {
    const apresEchec = jouer(etape('l-fourchette', 0).fen, 'h6f7');
    const apresRoi = jouer(toFEN(apresEchec), 'h8g8');
    // l'ancien FEN plaçait le roi noir en f8, case inaccessible depuis h8
    expect(placement(etape('l-fourchette', 1).fen)).toBe(placement(toFEN(apresRoi)));
  });

  test('la leçon garde du matériel une fois la tour prise', () => {
    const pos = jouer(etape('l-fourchette', 1).fen, 'f7d8');
    expect(insufficientMaterial(pos)).toBe(false);
  });
});

describe('F4 · plus de « victoire » qui se termine roi contre roi', () => {
  test.each(['fourch-roi', 'skewer-fou'])('%s : le matériel restant suffit, et la ligne est un vrai gain', (id) => {
    const p = probleme(id);
    const fin = jouerLigne(p.fen, p.line);
    expect(insufficientMaterial(fin)).toBe(false);
    // le moteur juge la position finale bonne pour les blancs : avant, tous les coups valaient ≈ −0,3
    expect(avantageBlanc(fin)).toBeGreaterThanOrEqual(80);
  });

  test('« skewer-fou » est un échange de fou contre dame, décrit comme tel', () => {
    const p = probleme('skewer-fou');
    // la position a des pions des deux camps : sans eux, Fxg7+ sauvait seulement la nulle
    const pos = parseFEN(p.fen);
    expect(pos.board.filter((x) => x === 'P').length).toBeGreaterThan(0);
    expect(pos.board.filter((x) => x === 'p').length).toBeGreaterThan(0);
    expect(p.desc).toMatch(/dame/);
    expect(p.desc).not.toMatch(/largement gagnant/);
  });

  test('« fourch-roi » : le roi noir ne peut pas reprendre le cavalier fourchant', () => {
    const p = probleme('fourch-roi');
    const apres = jouer(p.fen, 'd5e7');
    // dans l'ancienne position, le roi noir voisin de la tour reprenait le
    // cavalier qui l'avait prise : la « fourchette » ne gagnait que l'échange
    expect(legalMoves(apres).some((m) => squareName(m.to) === 'e7')).toBe(false);
    expect(legalMoves(apres).map(uci).sort()).toEqual(['g8f8', 'g8h8']);
  });
});

describe('F5 · « rayons-x » : la seconde tour n’intervient pas', () => {
  test('Txd8 mate même sans la tour de e1', () => {
    const p = probleme('rayons-x');
    const seule = p.fen.replace('3RR1K1', '3R2K1');
    expect(seule).not.toBe(p.fen);
    expect(gameStatus(jouer(seule, 'd1d8'))).toBe('mate');
  });

  test('le texte ne parle plus d’une tour qui « soutient »', () => {
    const p = probleme('rayons-x');
    expect(p.desc).not.toMatch(/soutient|seconde/i);
    expect(p.desc).toMatch(/couloir/i);
  });
});

describe('F6 · « deviation » : Da8+ est imprenable et mate en deux', () => {
  const p = () => probleme('deviation');

  test('la dame noire n’est pas en prise avant le coup : rien à gagner en la prenant', () => {
    const pos = parseFEN(p().fen);
    // dans l'ancienne position, la tour d1 (et la dame a4) attaquaient d7 : Txd7 gagnait la dame
    expect(isAttacked(pos, at('d7'), 'w')).toBe(false);
  });

  test('Da8+ ne peut pas être prise : toutes les parades sont des interpositions, suivies d’un mat', () => {
    const apres = jouer(p().fen, 'a2a8');
    const reponses = legalMoves(apres);
    expect(reponses.length).toBeGreaterThan(0);
    reponses.forEach((r) => {
      // aucune réponse ne prend la dame blanche : elle n'est pas « offerte »
      expect(r.captured ?? null).toBeNull();
      const suite = makeMove(apres, r);
      const mats = legalMoves(suite).filter((m) => gameStatus(makeMove(suite, m)) === 'mate');
      expect(mats.length).toBeGreaterThan(0);
    });
  });

  test('le texte décrit une interposition forcée, non un sacrifice', () => {
    expect(p().desc).not.toMatch(/s'offre|s’offre/);
    expect(p().desc).toMatch(/interpose|interposer/);
  });
});

describe('F7 · la découverte devient utile', () => {
  test.each([
    ['le problème', () => probleme('decouverte').fen],
    ['la leçon', () => etape('l-decouverte', 0).fen],
  ])('%s : la dame est défendue et seul l’échec de la tour empêche la reprise', (_nom, fen) => {
    const pos = parseFEN(fen());
    // le cavalier défend la dame : sans l'échec, Fxb7 serait repris
    expect(isAttacked(pos, at('b7'), 'b')).toBe(true);
    const apres = jouer(fen(), 'e4b7');
    expect(inCheck(apres, 'b')).toBe(true);
    // et parmi les réponses légales, aucune ne reprend le fou
    legalMoves(apres).forEach((m) => expect(squareName(m.to)).not.toBe('b7'));
  });

  test('Fc6+, qui ne découvre rien de plus, ne vaut plus Fxb7+', () => {
    const v = valeursDesCoups(probleme('decouverte').fen);
    expect(v.e4b7 - v.e4c6).toBeGreaterThanOrEqual(200);
  });

  test('le texte de la leçon dit pourquoi la dame ne peut être reprise', () => {
    expect(etape('l-decouverte', 0).say).toMatch(/cavalier/);
    expect(etape('l-decouverte', 0).say).toMatch(/échec de la tour/);
  });
});

describe('F9 · « le roi actif » a un roi à activer', () => {
  test('la position n’est plus deux rois seuls', () => {
    const pos = parseFEN(etape('l-roi-actif', 0).fen);
    expect(insufficientMaterial(pos)).toBe(false);
    expect(pos.board.filter((p) => p === 'P' || p === 'p').length).toBeGreaterThan(0);
  });

  test('Re4 attaque un pion que le roi noir ne peut plus défendre, et c’est le seul bon coup', () => {
    const fen = etape('l-roi-actif', 1).fen;
    const pos = parseFEN(fen);
    expect(isAttacked(pos, at('e5'), 'b')).toBe(false); // le pion e5 est seul
    const v = valeursDesCoups(fen);
    const autres = Object.entries(v).filter(([c]) => c !== 'e3e4');
    autres.forEach(([, valeur]) => expect(v.e3e4 - valeur).toBeGreaterThanOrEqual(100));
    expect(etape('l-roi-actif', 1).say).not.toMatch(/face au roi adverse/);
  });
});

describe('F10 · « la tour sur la 7e » : le texte dit ce que la tour attaque', () => {
  test('Ta7 attaque f7 — un seul pion — et pas « tous » les pions', () => {
    const avant = etape('l-tour7', 0);
    const apres = jouer(avant.fen, 'a1a7');
    // les blancs rejoueraient : on liste ce que la tour attaquerait
    const blancsAuTrait = parseFEN(toFEN(apres).replace(' b ', ' w '));
    const prises = legalMoves(blancsAuTrait).filter((m) => m.from === at('a7') && m.captured);
    expect(prises.map((m) => squareName(m.to))).toEqual(['f7']);
    expect(avant.say).toMatch(/f7/);
    expect(avant.say).not.toMatch(/tous à la fois|les attaque tous/);
  });

  test('l’étape suivante montre la position après le coup : trait aux noirs', () => {
    expect(parseFEN(etape('l-tour7', 1).fen).turn).toBe('b');
  });
});

// ------------------------------------------------------------- TROMPEUR

describe('positions dont le trait ne collait pas au coup qui vient d’être joué', () => {
  test.each([
    ['roque', 2, 'b'], // les blancs viennent de roquer
    ['developpement', 1, 'b'], // les blancs viennent de sortir le fou
    ['l-tour7', 1, 'b'], // les blancs viennent de jouer Ta7
    ['l-decouverte', 1, 'b'],
    ['l-fourchette', 1, 'w'], // le roi vient de parer l'échec : aux blancs
  ] as const)('%s, étape %i : trait aux %s', (id, i, trait) => {
    expect(parseFEN(etape(id, i).fen).turn).toBe(trait);
  });
});

describe('roque : les conditions sont dites, et la position est jouable', () => {
  test('le texte énumère les trois conditions', () => {
    const texte = lecon('roque').steps.map((s) => s.say).join(' ');
    expect(texte).toMatch(/déjà bougé/);
    expect(texte).toMatch(/en échec/);
    expect(texte).toMatch(/case attaquée/);
  });

  test('la position autorise réellement le petit roque', () => {
    const pos = parseFEN(etape('roque', 1).fen);
    const roque = findMove(pos, at('e1'), at('g1'));
    expect(roque?.castle).toBe('K');
  });
});

describe('« développer ses pièces » ne prétend plus que tout est sorti', () => {
  test('un cavalier et un fou seulement : Cb1 et Fc1 sont encore chez eux', () => {
    const s = etape('developpement', 1);
    const pos = parseFEN(s.fen);
    expect(pos.board[at('b1')]).toBe('N');
    expect(pos.board[at('c1')]).toBe('B');
    expect(s.say).not.toMatch(/Cavaliers et fous dehors/);
    expect(s.say).toMatch(/Un cavalier et un fou/);
  });
});

describe('« l’échec et mat » dit vrai sur les fuites du roi', () => {
  test('f7, g7 et h7 sont occupées ; f8 et h8 ne le sont pas avant la tour', () => {
    const s = etape('mat', 0);
    const pos = parseFEN(s.fen);
    ['f7', 'g7', 'h7'].forEach((c) => expect(pos.board[at(c)]).toBe('p'));
    // les « seules fuites » n'étaient donc pas toutes occupées : f8 et h8 étaient libres
    expect(pos.board[at('f8')]).toBeNull();
    expect(pos.board[at('h8')]).toBeNull();
    expect(s.say).not.toMatch(/seules fuites/);
    expect(s.say).toMatch(/f7, g7 et h7/);
    expect(gameStatus(jouer(s.fen, 'd1d8'))).toBe('mate');
  });
});

describe('« mater avec la dame » enseigne une technique, pas un mat en un', () => {
  test('roi d’abord, dame ensuite, avec le piège du pat', () => {
    const steps = lecon('l-mat-dame').steps;
    expect(steps.length).toBeGreaterThanOrEqual(4);
    // une tâche est un coup de roi : « d'abord le roi »
    const coupsDeRoi = steps.filter((s) => s.task && parseFEN(s.fen).board[at(s.task.from)] === 'K');
    expect(coupsDeRoi.length).toBeGreaterThanOrEqual(1);
    // la position est celle de l'audit : 1.Rf6 Rh7 2.Dg7#, et Dg6 est pat
    const depart = steps[0].fen;
    expect(placement(depart)).toBe('7k/8/8/5K2/8/8/8/6Q1');
    expect(gameStatus(jouer(depart, 'g1g6'))).toBe('stalemate');
    const apresRoi = jouer(depart, 'f5f6');
    expect(legalMoves(apresRoi).map(uci)).toEqual(['h8h7']);
    const apresH7 = jouer(toFEN(apresRoi), 'h8h7');
    expect(gameStatus(makeMove(apresH7, findMove(apresH7, at('g1'), at('g7'))!))).toBe('mate');
    expect(steps.map((s) => s.say).join(' ')).toMatch(/pat/);
  });

  test('la position de départ est celle de la technique, et l’étape suivante celle qui la suit', () => {
    const steps = lecon('l-mat-dame').steps;
    const apresRoi = jouer(steps[1].fen, 'f5f6');
    const apresRoiNoir = jouer(toFEN(apresRoi), 'h8h7');
    expect(placement(steps[2].fen)).toBe(placement(toFEN(apresRoiNoir)));
  });
});

describe('ouvertures : les noms sont ceux du répertoire, et les notes disent vrai', () => {
  const noms = new Set(LIGNES.map((l) => l.nom));
  /** Ouvertures de la liste qui n'ont pas de ligne à elles dans le répertoire, avec leur famille. */
  const HORS_REPERTOIRE: Record<string, string> = { 'Gambit Evans': 'Partie italienne' };

  test.each(OPENINGS.map((o) => [o.nom, o] as const))('« %s »', (nom, o) => {
    const attendu = HORS_REPERTOIRE[nom] ?? nom;
    // le nom de la liste existe dans le répertoire (ou a sa famille documentée)
    expect(noms.has(attendu)).toBe(true);
    // et la ligne, jouée, se nomme comme la liste la nomme
    const coups = playSAN(o.san).map((m) => `${squareName(m.from)}${squareName(m.to)}`);
    expect(nommerOuverture(coups)).toBe(attendu);
  });

  test('les deux noms discordants de l’audit sont harmonisés', () => {
    const liste = OPENINGS.map((o) => o.nom);
    expect(liste).not.toContain('Partie anglaise');
    expect(liste).not.toContain('Ruy Lopez (espagnole)');
    expect(liste).toContain('Ouverture anglaise');
    expect(liste).toContain('Partie espagnole');
  });

  test('le gambit dame n’est plus présenté comme un pion offert pour de bon', () => {
    const o = OPENINGS.find((x) => x.nom.startsWith('Gambit dame'))!;
    expect(o.note).not.toMatch(/offrent un pion/);
    expect(o.note).toMatch(/reprennent/);
  });
});

describe('une première leçon apprend à lire l’échiquier', () => {
  test('les coordonnées et la notation sont introduites avant tout autre usage', () => {
    expect(LESSONS[0].id).toBe('coordonnees');
    const texte = LESSONS[0].steps.map((s) => s.say).join(' ');
    expect(texte).toMatch(/colonne/);
    expect(texte).toMatch(/rangée/);
    ['R le roi', 'D la dame', 'T la tour', 'F le fou', 'C le cavalier'].forEach((n) => expect(texte).toContain(n));
    expect(texte).toMatch(/Cf3/);
    // elle se joue : un coup à faire, sur une case nommée par le texte
    expect(LESSONS[0].steps.some((s) => s.task)).toBe(true);
  });
});

describe('les positions cassées par l’audit ne reviennent pas', () => {
  test('aucune leçon ne montre deux rois seuls quand elle parle de gagner ou de mater', () => {
    LESSONS.forEach((l) =>
      l.steps.forEach((s) => {
        if (/gagn|mat\b|mate\b/.test(s.say)) {
          expect(`${l.id}: ${insufficientMaterial(parseFEN(s.fen))}`).toBe(`${l.id}: false`);
        }
      }),
    );
  });

  test('la pièce qui donne échec dans une tâche de leçon n’est jamais offerte pour rien', () => {
    // le défaut de « l'échec » : Td8+ pouvait être prise par le roi, sans recapture
    const fautives: string[] = [];
    LESSONS.forEach((l) =>
      l.steps.forEach((s, i) => {
        if (!s.task) return;
        const apres = jouer(s.fen, `${s.task.from}${s.task.to}${s.task.promotion?.toLowerCase() ?? ''}`);
        if (!inCheck(apres, apres.turn)) return;
        legalMoves(apres)
          .filter((m) => m.to === at(s.task!.to) && m.captured)
          .forEach((prise) => {
            const reprise = makeMove(apres, prise);
            const recapture = legalMoves(reprise).some((m) => m.to === at(s.task!.to) && m.captured);
            if (!recapture) fautives.push(`${l.id}:${i}`);
          });
      }),
    );
    expect(fautives).toEqual([]);
  });
});
