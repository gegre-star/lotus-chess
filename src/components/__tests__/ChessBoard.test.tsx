import React from 'react';
import renderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { Path } from 'react-native-svg';
import { ChessBoard } from '../ChessBoard';
import { START_FEN, parseFEN, squareFromName } from '../../chess/engine';

const position = parseFEN(START_FEN);

const render = (props: Partial<React.ComponentProps<typeof ChessBoard>> = {}) => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<ChessBoard position={position} size={320} {...props} />);
  });
  return tree.root;
};

const press = (root: ReactTestInstance, square: string) => {
  act(() => {
    root.findByProps({ testID: `square-${square}` }).props.onPress();
  });
};

describe('ChessBoard', () => {
  it('rend une case par position', () => {
    const root = render();
    expect(root.findAllByProps({ testID: 'square-e1' })).not.toHaveLength(0);
    expect(root.findAllByProps({ testID: 'square-h8' })).not.toHaveLength(0);
  });

  it('signale la case touchée', () => {
    const onPressSquare = jest.fn();
    const root = render({ onPressSquare });
    press(root, 'e2');
    expect(onPressSquare).toHaveBeenCalledWith(squareFromName('e2'));
  });

  /**
   * Régression : le calque des flèches est positionné en absolu par-dessus
   * l'échiquier. Sans `pointerEvents="none"`, il absorbe tous les touchers et
   * rend les cases inutilisables — donc toute leçon affichant une flèche
   * devient impossible à terminer.
   */
  describe('calque des flèches', () => {
    it('laisse passer les touchers', () => {
      const root = render({ arrows: [['e2', 'e4']] });
      const overlay = root.findByProps({ testID: 'arrow-overlay' });
      expect(overlay.props.pointerEvents).toBe('none');
    });

    it('n’empêche pas de jouer la case qu’il recouvre', () => {
      const onPressSquare = jest.fn();
      const root = render({ arrows: [['e2', 'e4']], onPressSquare });
      // e4 est la pointe de la flèche : c'est la case la plus exposée au blocage
      press(root, 'e4');
      expect(onPressSquare).toHaveBeenCalledWith(squareFromName('e4'));
    });

    it('n’existe pas quand aucune flèche n’est demandée', () => {
      const root = render();
      expect(root.findAllByProps({ testID: 'arrow-overlay' })).toHaveLength(0);
    });
  });
});

/**
 * Régression : les marges et la pointe étaient de taille fixe et consommaient
 * 1,02 case. Sur une flèche d'une seule case — la poussée de pion, le coup le
 * plus fréquent des leçons — il ne restait rien à dessiner.
 */
describe('géométrie des flèches', () => {
  const cheminDe = (from: string, to: string): string => {
    const root = render({ arrows: [[from, to]] });
    return root.findByProps({ testID: 'arrow-overlay' }).findAllByType(Path)[0].props.d as string;
  };

  /** Toutes les coordonnées d'un chemin SVG. */
  const points = (d: string): number[] =>
    (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

  it('dessine une flèche d’une case sans la réduire à un point', () => {
    const pts = points(cheminDe('e2', 'e3'));
    const ys = pts.filter((_, i) => i % 2 === 1);
    // la flèche doit couvrir une hauteur appréciable, pas se replier sur elle-même
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.3);
  });

  it('ne produit aucune coordonnée invalide', () => {
    ['e3', 'e4', 'e8', 'h5', 'a6'].forEach((to) => {
      points(cheminDe('e2', to)).forEach((n) => expect(Number.isFinite(n)).toBe(true));
    });
  });

  it('garde les flèches longues à pleine taille', () => {
    const pts = points(cheminDe('e1', 'e8'));
    const ys = pts.filter((_, i) => i % 2 === 1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(5);
  });
});
