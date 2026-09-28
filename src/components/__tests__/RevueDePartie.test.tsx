import React from 'react';
import renderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { Path } from 'react-native-svg';
import { RevueDePartie, COULEUR_VERDICT, flechesDuCoup, marqueursDeFautes } from '../RevueDePartie';
import { ChessBoard } from '../ChessBoard';

/** L'échiquier est mémoïsé : `findByType` doit viser le composant interne. */
const plateau = (root: { findAll: (f: (n: any) => boolean) => any[] }) =>
  root.findAll((n) => n.type === (ChessBoard as unknown as { type: unknown }).type)[0];
import { analyserPartie, type RevueComplete } from '../../analysis/review';
import { toUci } from '../../analysis/local';
import {
  START_FEN,
  makeMove,
  parseFEN,
  playSAN,
  squareFromName,
  toFEN,
  type Position,
} from '../../chess/engine';
import type { Analysis, AnalysisEngine } from '../../analysis/types';

/**
 * Partie fabriquée : le mat du berger, avec une erreur blanche au 2e coup
 * (Dh5 trop tôt) et une gaffe noire au 3e (Cf6??), puis 4.Dxf7#.
 *
 *   1.e4 e5 2.Dh5? Cc6 3.Fc4 Cf6?? 4.Dxf7#
 *
 * Les évaluations sont scriptées (point de vue des blancs) : le test porte sur
 * l'écran, pas sur la force d'un moteur.
 */
const SCORES = [20, 25, 25, -150, -150, -100, 900];
const MEILLEURS: Record<number, string> = { 2: 'g1f3', 5: 'd7d6' };
const PVS: Record<number, string[]> = { 2: ['g1f3', 'b8c6', 'f1b5'] };

const coups = playSAN('e4 e5 Qh5 Nc6 Bc4 Nf6 Qxf7#');
const depart = parseFEN(START_FEN);
const positions: Position[] = [depart];
coups.forEach((m, i) => positions.push(makeMove(positions[i], m)));

function moteurScripte(): AnalysisEngine {
  const parFen = new Map<string, number>();
  positions.forEach((p, i) => parFen.set(toFEN(p), i));
  return {
    name: 'stockfish',
    dispose: () => undefined,
    async analyse(fen): Promise<Analysis> {
      const i = parFen.get(fen)!;
      const blancs = positions[i].turn === 'w';
      const best = MEILLEURS[i] ?? toUci(coups[i]);
      return {
        best,
        cp: blancs ? SCORES[i] : -SCORES[i],
        mate: null,
        depth: 10,
        pv: PVS[i] ?? [best],
        engine: 'stockfish',
      };
    },
  };
}

let revue: RevueComplete;
beforeAll(async () => {
  revue = await analyserPartie(moteurScripte(), depart, coups, [], { joueur: 'w' });
});

type Props = Partial<React.ComponentProps<typeof RevueDePartie>>;

const monter = (props: Props = {}) => {
  let arbre!: renderer.ReactTestRenderer;
  const onFermer = jest.fn();
  act(() => {
    arbre = renderer.create(
      <RevueDePartie
        revue={revue}
        positions={positions}
        joueur="w"
        taille={320}
        noms={{ blancs: 'Lou', noirs: 'Robi' }}
        onFermer={onFermer}
        {...props}
      />,
    );
  });
  return { root: arbre.root, onFermer };
};

const un = (root: ReactTestInstance, testID: string) => root.findAllByProps({ testID })[0];
const toucher = (root: ReactTestInstance, testID: string) =>
  act(() => {
    un(root, testID).props.onPress();
  });

/** Texte concaténé d'un nœud, pour lire ce que l'écran affiche. */
const texte = (n: ReactTestInstance): string =>
  n.children.map((c) => (typeof c === 'string' ? c : texte(c))).join('');
const lire = (root: ReactTestInstance, testID: string) => texte(un(root, testID));

describe('fonctions pures du composant', () => {
  it('trace deux flèches sur une erreur : le coup joué en rouge, le meilleur en vert', () => {
    const f = flechesDuCoup(revue.coups[2]);
    expect(f).toHaveLength(2);
    // rouge = le coup joué (Dh5), vert = celui qu'il fallait jouer (Cf3)
    expect(f[0]).toEqual(['d1', 'h5', COULEUR_VERDICT.gaffe]);
    expect(f[1]).toEqual(['g1', 'f3', COULEUR_VERDICT.bon]);
  });

  it('ne trace qu’une flèche sur un bon coup', () => {
    expect(flechesDuCoup(revue.coups[0])).toHaveLength(1);
  });

  it('pose un repère sur chaque erreur et gaffe, des deux camps', () => {
    expect(marqueursDeFautes(revue.coups).map((m) => m.index)).toEqual([2, 5]);
  });
});

describe('RevueDePartie', () => {
  it('affiche la précision des deux camps avec leurs noms', () => {
    const { root } = monter();
    expect(lire(root, 'revue-precision-w')).toContain('Lou (toi)');
    expect(lire(root, 'revue-precision-b')).toContain('Robi');
    expect(lire(root, 'revue-precision-w')).toMatch(/\d+ %/);
    // les blancs ont fait une erreur, les noirs une gaffe : les deux sont sous 100
    expect(revue.precision.w!).toBeLessThan(100);
    expect(revue.precision.b!).toBeLessThan(revue.precision.w!);
  });

  it('affiche le tableau par catégorie, camp par camp', () => {
    const { root } = monter();
    expect(lire(root, 'revue-resume-erreur-w')).toBe('1');
    expect(lire(root, 'revue-resume-erreur-b')).toBe('0');
    expect(lire(root, 'revue-resume-gaffe-b')).toBe('1');
    expect(lire(root, 'revue-resume-gaffe-w')).toBe('0');
    expect(root.findAllByProps({ testID: 'revue-resume-brillant' }).length).toBeGreaterThan(0);
  });

  it('liste tous les coups, colorés selon leur verdict', () => {
    const { root } = monter();
    coups.forEach((_, i) => expect(un(root, `revue-coup-${i}`)).toBeDefined());
    const gaffe = StyleSheet.flatten(un(root, 'revue-coup-5').props.style);
    expect(gaffe.borderLeftColor).toBe(COULEUR_VERDICT.gaffe);
    const bon = StyleSheet.flatten(un(root, 'revue-coup-0').props.style);
    expect(bon.borderLeftColor).toBe(COULEUR_VERDICT.bon);
  });

  it('dessine la courbe avec une zone tactile par position', () => {
    const { root } = monter();
    for (let i = 0; i <= coups.length; i += 1) expect(un(root, `eval-zone-${i}`)).toBeDefined();
    expect(root.findAllByProps({ testID: `eval-zone-${coups.length + 1}` })).toHaveLength(0);
  });

  it('ouvre sur la position de départ et commente le premier coup', () => {
    const { root } = monter();
    expect(lire(root, 'revue-position')).toContain('Avant 1. e4');
    expect(lire(root, 'revue-titre')).toContain('e4');
  });

  it('respecte la position initiale demandée', () => {
    const { root } = monter({ indexInitial: 2 });
    expect(lire(root, 'revue-titre')).toContain('Dh5');
  });

  describe('navigation', () => {
    it('avance et recule avec ◀ ▶, et éteint les boutons aux extrémités', () => {
      const { root } = monter();
      expect(un(root, 'revue-precedent').props.disabled).toBe(true);
      toucher(root, 'revue-suivant');
      expect(lire(root, 'revue-titre')).toContain('e5');
      toucher(root, 'revue-precedent');
      expect(lire(root, 'revue-titre')).toContain('e4');
    });

    it('va jusqu’à la position finale, qui n’a pas de coup à commenter', () => {
      const { root } = monter();
      for (let i = 0; i < coups.length; i += 1) toucher(root, 'revue-suivant');
      expect(lire(root, 'revue-position')).toBe('Position finale');
      expect(un(root, 'revue-suivant').props.disabled).toBe(true);
      expect(un(root, 'revue-suite').props.disabled).toBe(true);
      expect(root.findAllByProps({ testID: 'revue-titre' })).toHaveLength(0);
      expect(lire(root, 'revue-eval')).toBe('1-0');
    });

    it('saute au coup touché dans la liste', () => {
      const { root } = monter();
      toucher(root, 'revue-coup-5');
      expect(lire(root, 'revue-titre')).toContain('Cf6');
      expect(lire(root, 'revue-titre')).toContain('Gaffe');
    });

    it('saute à la position touchée sur la courbe', () => {
      const { root } = monter();
      toucher(root, 'eval-zone-3');
      expect(lire(root, 'revue-titre')).toContain('Cc6');
    });

    it('« Erreur suivante » va à la prochaine faute de l’élève, puis s’éteint', () => {
      const { root } = monter();
      expect(un(root, 'revue-erreur-suivante').props.disabled).toBe(false);
      toucher(root, 'revue-erreur-suivante');
      // l'élève joue les blancs : sa seule faute est 2.Dh5 (la gaffe noire n'est pas la sienne)
      expect(lire(root, 'revue-titre')).toContain('Dh5');
      expect(un(root, 'revue-erreur-suivante').props.disabled).toBe(true);
    });

    it('cherche les fautes des noirs quand l’élève joue les noirs', () => {
      const { root } = monter({ joueur: 'b' });
      toucher(root, 'revue-erreur-suivante');
      expect(lire(root, 'revue-titre')).toContain('Cf6');
    });

    it('signale le moment critique', () => {
      const { root } = monter();
      toucher(root, 'revue-coup-5');
      expect(revue.critique).toBe(5);
      expect(lire(root, 'revue-critique')).toContain('moment critique');
    });
  });

  describe('échiquier', () => {
    const fleches = (root: ReactTestInstance) => {
      const surcouche = root.findAllByProps({ testID: 'arrow-overlay' })[0];
      return surcouche ? surcouche.findAllByType(Path).length : 0;
    };

    it('montre les deux flèches sur une erreur, et le meilleur coup en texte', () => {
      const { root } = monter({ indexInitial: 2 });
      expect(fleches(root)).toBe(2);
      expect(lire(root, 'revue-meilleur')).toContain('Meilleur coup : Cf3');
    });

    it('ne montre qu’une flèche sur un bon coup', () => {
      const { root } = monter({ indexInitial: 0 });
      expect(fleches(root)).toBe(1);
      expect(root.findAllByProps({ testID: 'revue-meilleur' })).toHaveLength(0);
    });

    it('affiche la position d’avant le coup commenté', () => {
      const { root } = monter({ indexInitial: 2 });
      const echiquier = plateau(root);
      // avant 2.Dh5 : le pion e4 est joué, la dame est encore en d1
      expect(toFEN(echiquier.props.position)).toBe(toFEN(positions[2]));
    });

    it('retourne l’échiquier quand l’élève joue les noirs, sauf demande contraire', () => {
      expect(plateau(monter({ joueur: 'b' }).root).props.flipped).toBe(true);
      expect(plateau(monter({ joueur: 'w' }).root).props.flipped).toBe(false);
      expect(plateau(monter({ joueur: 'b', flipped: false }).root).props.flipped).toBe(false);
    });

    it('transmet le thème et les coordonnées', () => {
      const { root } = monter({ theme: 'bois', coords: false });
      const e = plateau(root);
      expect(e.props.theme).toBe('bois');
      expect(e.props.showCoords).toBe(false);
    });
  });

  describe('meilleure suite', () => {
    it('déroule la variante coup par coup depuis la position d’avant', () => {
      const { root } = monter({ indexInitial: 2 });
      toucher(root, 'revue-suite');
      expect(lire(root, 'revue-position')).toContain('Meilleure suite · coup 0/3');
      expect(lire(root, 'revue-texte')).toContain('Cf3');

      toucher(root, 'revue-suivant');
      expect(lire(root, 'revue-position')).toContain('coup 1/3');
      expect(toFEN(plateau(root).props.position)).not.toBe(toFEN(positions[2]));
      // le coup en cours est encadré dans la ligne
      expect(lire(root, 'revue-texte')).toContain('[2. Cf3]');

      toucher(root, 'revue-suivant');
      toucher(root, 'revue-suivant');
      expect(lire(root, 'revue-position')).toContain('coup 3/3');
      expect(un(root, 'revue-suivant').props.disabled).toBe(true);
      expect(lire(root, 'revue-texte')).toContain('2. Cf3 Cc6 [3. Fb5]');
    });

    it('joue réellement les coups sur l’échiquier', () => {
      const { root } = monter({ indexInitial: 2 });
      toucher(root, 'revue-suite');
      toucher(root, 'revue-suivant');
      const pos: Position = plateau(root).props.position;
      expect(pos.board[squareFromName('f3')]).toBe('N');
      expect(pos.board[squareFromName('g1')]).toBeNull();
    });

    it('revient à la partie, à la même position', () => {
      const { root } = monter({ indexInitial: 2 });
      toucher(root, 'revue-suite');
      toucher(root, 'revue-suivant');
      toucher(root, 'revue-retour');
      expect(lire(root, 'revue-position')).toContain('Avant 2. Dh5');
      expect(toFEN(plateau(root).props.position)).toBe(toFEN(positions[2]));
      expect(un(root, 'revue-suite')).toBeDefined();
    });

    it('se ferme quand on saute ailleurs dans la partie', () => {
      const { root } = monter({ indexInitial: 2 });
      toucher(root, 'revue-suite');
      toucher(root, 'revue-coup-4');
      expect(lire(root, 'revue-position')).toContain('Avant');
      expect(root.findAllByProps({ testID: 'revue-retour' })).toHaveLength(0);
    });

    it('propose la variante à un seul coup quand le moteur n’en donne pas plus', () => {
      const { root } = monter({ indexInitial: 5 });
      toucher(root, 'revue-suite');
      expect(lire(root, 'revue-position')).toContain('coup 0/1');
    });
  });

  describe('boutons', () => {
    it('ferme par l’en-tête et par le pied', () => {
      const { root, onFermer } = monter();
      toucher(root, 'revue-fermer');
      toucher(root, 'revue-fermer-bas');
      expect(onFermer).toHaveBeenCalledTimes(2);
    });

    it('n’affiche « Rejouer » que si l’écran sait rejouer', () => {
      expect(monter().root.findAllByProps({ testID: 'revue-rejouer' })).toHaveLength(0);
      const onRejouer = jest.fn();
      const { root } = monter({ onRejouer });
      toucher(root, 'revue-rejouer');
      expect(onRejouer).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * Sur un iPhone SE, l'écran fait 320 px : rien de ce que le composant
   * dimensionne ne doit dépasser cette largeur, sous peine de défilement
   * horizontal ou de contenu coupé.
   */
  describe('largeur de 320 px', () => {
    const largeurs = (n: ReactTestInstance, acc: number[] = []): number[] => {
      const s = typeof n.type === 'string' ? StyleSheet.flatten(n.props.style) : null;
      if (s && typeof s.width === 'number') acc.push(s.width);
      if (n.props?.width && typeof n.props.width === 'number') acc.push(n.props.width);
      n.children.forEach((c) => typeof c !== 'string' && largeurs(c, acc));
      return acc;
    };

    it('ne dimensionne rien au-delà de la largeur de l’échiquier', () => {
      const { root } = monter({ taille: 320 });
      expect(Math.max(...largeurs(root))).toBeLessThanOrEqual(320);
    });

    it('suit la taille demandée : à 288 px, rien ne dépasse non plus', () => {
      const { root } = monter({ taille: 288 });
      expect(Math.max(...largeurs(root))).toBeLessThanOrEqual(288);
    });

    it('laisse le texte passer à la ligne au lieu de déborder', () => {
      const { root } = monter({ taille: 320, indexInitial: 2 });
      const colonnes = root.findAll(
        (n) => typeof n.type === 'string' && StyleSheet.flatten(n.props.style)?.width === 320,
      );
      expect(colonnes.length).toBeGreaterThan(5);
      // aucun style ne force une ligne unique sur le texte du coach
      const styleTexte = StyleSheet.flatten(un(root, 'revue-texte').props.style);
      expect(styleTexte.flexWrap).not.toBe('nowrap');
    });
  });
});
