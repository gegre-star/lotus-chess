/**
 * La partie comme valeur : jouer, annuler, abandonner, sauvegarder, reprendre.
 *
 * Le défaut prouvé par l'audit — « Annuler » après la fin recomptait la
 * victoire — se joue dans ces fonctions, pas dans l'écran : c'est donc ici
 * qu'on le verrouille.
 */
import { BOTS } from '../content';
import {
  abandonner,
  annuler,
  auBot,
  avecIndice,
  campBot,
  depuisSauvegarde,
  estClassee,
  jouer,
  marquerScoree,
  nouvellePartie,
  perdreAuTemps,
  versSauvegarde,
  type Partie,
} from '../partie';
import { findMove, squareFromName, toFEN, type Color } from '../engine';

const bot = BOTS[0];

const coup = (p: Partie, de: string, vers: string, promo?: 'Q' | 'R' | 'B' | 'N') => {
  const m = findMove(p.position, squareFromName(de), squareFromName(vers), promo);
  if (!m) throw new Error(`coup ${de}${vers} illégal`);
  return jouer(p, m);
};

const suite = (p: Partie, coups: string[]): Partie =>
  coups.reduce((acc, u) => coup(acc, u.slice(0, 2), u.slice(2, 4), u[4] ? (u[4].toUpperCase() as 'Q') : undefined), p);

describe('déroulement', () => {
  test('une partie neuve est au départ, sans fin, ni classée à part', () => {
    const p = nouvellePartie(bot, 'w');
    expect(p.moves).toHaveLength(0);
    expect(p.fin).toBeNull();
    expect(p.annulations).toBe(0);
    expect(estClassee(p)).toBe(true);
    expect(auBot(p)).toBe(false);
    expect(campBot(p)).toBe('b');
  });

  test('avec les noirs, l’ordinateur ouvre', () => {
    const p = nouvellePartie(bot, 'b');
    expect(auBot(p)).toBe(true);
  });

  test('jouer un coup l’enregistre avec sa notation et passe le trait', () => {
    const p = coup(nouvellePartie(bot, 'w'), 'e2', 'e4');
    expect(p.sans).toEqual(['e4']);
    expect(p.history).toHaveLength(1);
    expect(p.position.turn).toBe('b');
    expect(auBot(p)).toBe(true);
  });

  test('le mat du berger termine la partie, au bénéfice de l’élève', () => {
    const p = suite(nouvellePartie(bot, 'w'), ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6', 'h5f7']);
    expect(p.fin).toMatchObject({ statut: 'mate', resultat: 'win' });
    expect(auBot(p)).toBe(false);
  });

  test('le mat du fou subi est une défaite', () => {
    const p = suite(nouvellePartie(bot, 'w'), ['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    expect(p.fin).toMatchObject({ statut: 'mate', resultat: 'loss' });
  });

  test('rien ne se joue après la fin', () => {
    const fini = suite(nouvellePartie(bot, 'w'), ['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    const apres = jouer(fini, findMove(fini.position, squareFromName('e1'), squareFromName('f2')) ?? fini.moves[0]);
    expect(apres).toBe(fini);
  });

  test('une triple répétition est nulle, avec les positions passées', () => {
    let p = nouvellePartie(bot, 'w');
    p = suite(p, ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8']);
    expect(p.fin).toMatchObject({ statut: 'draw-repetition', resultat: 'draw' });
  });
});

describe('annuler : le défaut de l’audit', () => {
  test('retire le coup de l’élève et la réponse de l’ordinateur', () => {
    const p = suite(nouvellePartie(bot, 'w'), ['e2e4', 'e7e5']);
    const a = annuler(p);
    expect(a.moves).toHaveLength(0);
    expect(toFEN(a.position)).toBe(toFEN(nouvellePartie(bot, 'w').position));
    expect(a.annulations).toBe(1);
  });

  test('retire seulement le coup de l’élève si l’ordinateur n’a pas encore répondu', () => {
    const p = suite(nouvellePartie(bot, 'w'), ['e2e4']);
    expect(annuler(p).moves).toHaveLength(0);
  });

  test('IMPOSSIBLE après la fin : sinon la même défaite ou victoire se recompte', () => {
    const fini = suite(nouvellePartie(bot, 'w'), ['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    expect(annuler(fini)).toBe(fini);
    const gagnee = suite(nouvellePartie(bot, 'w'), ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6', 'h5f7']);
    expect(annuler(gagnee)).toBe(gagnee);
  });

  test('une partie où l’on a repris un coup n’est plus classée', () => {
    const p = annuler(suite(nouvellePartie(bot, 'w'), ['e2e4', 'e7e5']));
    expect(estClassee(p)).toBe(false);
  });

  test('un indice aussi la retire du classement', () => {
    expect(estClassee(avecIndice(nouvellePartie(bot, 'w')))).toBe(false);
  });

  test('avec les noirs, on ne remonte pas avant le premier coup de l’ordinateur', () => {
    const p = suite(nouvellePartie(bot, 'b'), ['e2e4']);
    expect(annuler(p)).toBe(p);
    const q = suite(p, ['e7e5']);
    expect(annuler(q).moves).toHaveLength(1);
  });

  test('rien à annuler au départ', () => {
    const p = nouvellePartie(bot, 'w');
    expect(annuler(p)).toBe(p);
  });
});

describe('fins hors échiquier', () => {
  test('abandonner est une défaite, une seule fois', () => {
    const p = abandonner(nouvellePartie(bot, 'w'));
    expect(p.fin).toMatchObject({ statut: 'abandon', resultat: 'loss' });
    expect(abandonner(p)).toBe(p);
  });

  test('le temps de l’élève écoulé est une défaite, celui du bot une victoire', () => {
    const p = nouvellePartie(bot, 'w');
    expect(perdreAuTemps(p, 'w', false).fin).toMatchObject({ statut: 'temps', resultat: 'loss' });
    expect(perdreAuTemps(p, 'b', false).fin).toMatchObject({ statut: 'temps', resultat: 'win' });
  });

  test('le temps écoulé contre un adversaire qui ne peut plus mater est nul', () => {
    expect(perdreAuTemps(nouvellePartie(bot, 'w'), 'w', true).fin).toMatchObject({
      statut: 'temps-nulle',
      resultat: 'draw',
    });
  });

  test('on ne compte une partie qu’une fois', () => {
    const p = marquerScoree(abandonner(nouvellePartie(bot, 'w')));
    expect(p.scoree).toBe(true);
    expect(marquerScoree(p)).toBe(p);
  });
});

describe('sauvegarde et reprise', () => {
  test('rejouer la sauvegarde redonne exactement la même partie', () => {
    const p = suite(nouvellePartie(bot, 'w'), ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4']);
    const reprise = depuisSauvegarde(JSON.parse(JSON.stringify(versSauvegarde(p))), BOTS)!;
    expect(reprise).not.toBeNull();
    expect(toFEN(reprise.position)).toBe(toFEN(p.position));
    expect(reprise.sans).toEqual(p.sans);
    expect(reprise.side).toBe('w');
    expect(reprise.bot.id).toBe(bot.id);
  });

  test('conserve le camp, le classement du bot, les coups repris et les indices', () => {
    const stockfish = BOTS.find((b) => b.stockfish)!;
    let p = nouvellePartie({ ...stockfish, elo: 2100 }, 'b');
    p = suite(p, ['e2e4', 'e7e5']);
    p = avecIndice(annuler(p));
    const reprise = depuisSauvegarde(JSON.parse(JSON.stringify(versSauvegarde(p))), BOTS)!;
    expect(reprise.side).toBe('b');
    expect(reprise.bot.elo).toBe(2100);
    expect(reprise.annulations).toBe(1);
    expect(reprise.indices).toBe(1);
  });

  test('conserve les promotions', () => {
    const p = nouvellePartie(bot, 'w');
    // partie fabriquée : on rejoue jusqu'à une promotion en cavalier
    const coups = ['a2a4', 'b7b5', 'a4b5', 'g8f6', 'b5b6', 'e7e6', 'b6c7', 'd8e7', 'c7b8n'];
    const jouee = suite(p, coups);
    const reprise = depuisSauvegarde(JSON.parse(JSON.stringify(versSauvegarde(jouee))), BOTS)!;
    expect(toFEN(reprise.position)).toBe(toFEN(jouee.position));
  });

  test.each([
    ['rien', null],
    ['une chaîne', 'bonjour'],
    ['une version inconnue', { v: 2, botId: 'pixou', side: 'w', moves: [] }],
    ['un bot inconnu', { v: 1, botId: 'zorglub', side: 'w', moves: [] }],
    ['un camp invalide', { v: 1, botId: 'pixou', side: 'x', moves: [] }],
    ['des coups qui ne sont pas un tableau', { v: 1, botId: 'pixou', side: 'w', moves: 'e2e4' }],
    ['un coup mal formé', { v: 1, botId: 'pixou', side: 'w', moves: ['e2e9'] }],
    ['un coup illégal', { v: 1, botId: 'pixou', side: 'w', moves: ['e2e5'] }],
    ['une partie déjà terminée', { v: 1, botId: 'pixou', side: 'w', moves: ['f2f3', 'e7e5', 'g2g4', 'd8h4'] }],
  ])('refuse une sauvegarde abîmée : %s', (_nom, donnees) => {
    expect(depuisSauvegarde(donnees, BOTS)).toBeNull();
  });

  test('deux parties n’ont jamais le même identifiant', () => {
    const ids = new Set(Array.from({ length: 200 }, () => nouvellePartie(bot, 'w' as Color).id));
    expect(ids.size).toBe(200);
  });
});
