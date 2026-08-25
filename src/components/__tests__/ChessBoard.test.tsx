import React from 'react';
import renderer, { act, type ReactTestInstance } from 'react-test-renderer';
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
