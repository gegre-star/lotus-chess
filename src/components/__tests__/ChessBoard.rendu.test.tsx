import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { ChessBoard } from '../ChessBoard';
import { libelleCase, nomPiece, sondeRendu } from '../PlateauCase';
import { ChessPiece } from '../ChessPiece';
import {
  START_FEN,
  makeMove,
  movesFrom,
  parseFEN,
  squareFromName as at,
  squareName,
  type Position,
} from '../../chess/engine';

/**
 * Deux garanties de l'échiquier, chiffrées :
 *
 *  - après un coup, seules les cases modifiées sont redessinées — un échiquier
 *    de 64 `Pressable` qui se re-rend en entier à chaque tic de minuteur est ce
 *    qui rendait l'écran de jeu poussif ;
 *  - chaque case porte un libellé lisible par un lecteur d'écran.
 */

const depart = parseFEN(START_FEN);

/** Cases dont le rendu a été exécuté, dans l'ordre, pendant `travail`. */
function rendus(travail: () => void): string[] {
  const vus: string[] = [];
  sondeRendu.surRendu = (carre) => vus.push(squareName(carre));
  try {
    act(travail);
  } finally {
    sondeRendu.surRendu = null;
  }
  return vus;
}

function monter(props: Partial<React.ComponentProps<typeof ChessBoard>> = {}) {
  let tree!: renderer.ReactTestRenderer;
  const tout = (p: Partial<React.ComponentProps<typeof ChessBoard>>) => (
    <ChessBoard position={depart} size={320} {...props} {...p} />
  );
  const vus = rendus(() => {
    tree = renderer.create(tout({}));
  });
  return { tree, initial: vus, rerendre: (p: Partial<React.ComponentProps<typeof ChessBoard>>) => rendus(() => tree.update(tout(p))) };
}

const apres = (pos: Position, from: string, to: string): Position => {
  const coup = movesFrom(pos, at(from)).find((m) => m.to === at(to));
  if (!coup) throw new Error(`coup illégal ${from}${to}`);
  return makeMove(pos, coup);
};

describe('mémoïsation des cases', () => {
  it('rend les 64 cases une fois au montage', () => {
    const { initial } = monter();
    expect(initial).toHaveLength(64);
    expect(new Set(initial).size).toBe(64);
  });

  it('après un coup, seules les cases de départ et d’arrivée sont redessinées', () => {
    const { rerendre } = monter();
    const vus = rerendre({
      position: apres(depart, 'e2', 'e4'),
      lastMove: { from: at('e2'), to: at('e4') },
    });
    expect(vus.sort()).toEqual(['e2', 'e4']);
  });

  it('après un coup précédé d’une sélection, on ajoute les seules pastilles effacées', () => {
    const cibles = movesFrom(depart, at('e2'));
    const { rerendre } = monter({ selected: at('e2'), targets: cibles });
    const vus = rerendre({
      position: apres(depart, 'e2', 'e4'),
      selected: null,
      targets: [],
      lastMove: { from: at('e2'), to: at('e4') },
    });
    // e2 (départ, désélectionnée), e3 (pastille effacée), e4 (arrivée, pastille effacée)
    expect(vus.sort()).toEqual(['e2', 'e3', 'e4']);
  });

  it('une capture ne redessine que les deux cases concernées', () => {
    const avant = parseFEN('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2');
    const { rerendre } = monter({ position: avant });
    const vus = rerendre({ position: apres(avant, 'e4', 'd5') });
    expect(vus.sort()).toEqual(['d5', 'e4']);
  });

  it('un changement de flèches ne redessine aucune case', () => {
    const { rerendre } = monter();
    expect(rerendre({ arrows: [['e2', 'e4']] })).toEqual([]);
    expect(rerendre({ arrows: [['e2', 'e4'], ['g1', 'f3', '#ff0000']] })).toEqual([]);
    expect(rerendre({ arrows: [] })).toEqual([]);
  });

  it('des props identiques mais neuves (tableaux et fonctions reconstruits) ne redessinent rien', () => {
    const cibles = () => movesFrom(depart, at('e2'));
    const { rerendre } = monter({
      selected: at('e2'),
      targets: cibles(),
      arrows: [['e2', 'e4']],
      onPressSquare: () => undefined,
    });
    const vus = rerendre({
      selected: at('e2'),
      targets: cibles(),
      arrows: [['e2', 'e4']],
      lastMove: null,
      badges: {},
      onPressSquare: () => undefined,
    });
    expect(vus).toEqual([]);
  });

  it('des flèches identiques ne redessinent pas le calque des flèches', () => {
    const { tree, rerendre } = monter({ arrows: [['e2', 'e4']] });
    const avant = tree.root.findByProps({ testID: 'arrow-overlay' });
    rerendre({ arrows: [['e2', 'e4']] });
    // même instance : le calque n'a pas été recréé
    expect(tree.root.findByProps({ testID: 'arrow-overlay' })).toBe(avant);
  });

  it('un changement de gestionnaire n’en fait pas changer aux cases', () => {
    const premier = jest.fn();
    const second = jest.fn();
    const { tree, rerendre } = monter({ onPressSquare: premier });
    const surE4 = () => tree.root.findByProps({ testID: 'square-e4' }).props.onPress;
    const avant = surE4();
    rerendre({ onPressSquare: second });
    // même fonction : c'est ce qui permet à `React.memo` de sauter la case
    expect(surE4()).toBe(avant);
    act(() => surE4()());
    expect(second).toHaveBeenCalledWith(at('e4'));
    expect(premier).not.toHaveBeenCalled();
  });

  it('retourner l’échiquier redessine les cases, puisque leurs repères changent', () => {
    const { rerendre } = monter();
    expect(rerendre({ flipped: true }).length).toBeGreaterThan(0);
  });

  it('le roi mis en échec est redessiné, lui seul, avec son ancienne case', () => {
    const avant = parseFEN('4k3/8/8/8/8/8/4R3/4K3 w - - 0 1');
    const { rerendre } = monter({ position: avant });
    const vus = rerendre({ position: apres(avant, 'e2', 'e7') });
    // e2 (tour partie), e7 (arrivée) et e8 (roi noir, désormais en échec)
    expect(vus.sort()).toEqual(['e2', 'e7', 'e8']);
  });

  it('mémoïse les pièces', () => {
    // un composant `memo` porte le marqueur de React ; sans lui, chaque case redessinerait son SVG
    expect(String((ChessPiece as unknown as { $$typeof: symbol }).$$typeof)).toContain('memo');
  });
});

describe('accessibilité', () => {
  const libelle = (tree: renderer.ReactTestRenderer, nom: string): string =>
    tree.root.findByProps({ testID: `square-${nom}` }).props.accessibilityLabel;

  it('nomme la case et la pièce, en français', () => {
    const { tree } = monter();
    expect(libelle(tree, 'e2')).toBe('e2, pion blanc');
    expect(libelle(tree, 'e4')).toBe('e4, vide');
    expect(libelle(tree, 'e1')).toBe('e1, roi blanc');
    expect(libelle(tree, 'd1')).toBe('d1, dame blanche');
    expect(libelle(tree, 'a1')).toBe('a1, tour blanche');
    expect(libelle(tree, 'c1')).toBe('c1, fou blanc');
    expect(libelle(tree, 'b8')).toBe('b8, cavalier noir');
    expect(libelle(tree, 'd8')).toBe('d8, dame noire');
    expect(libelle(tree, 'h8')).toBe('h8, tour noire');
  });

  it('accorde le genre des douze pièces', () => {
    expect(
      (['K', 'Q', 'R', 'B', 'N', 'P', 'k', 'q', 'r', 'b', 'n', 'p'] as const).map(nomPiece),
    ).toEqual([
      'roi blanc',
      'dame blanche',
      'tour blanche',
      'fou blanc',
      'cavalier blanc',
      'pion blanc',
      'roi noir',
      'dame noire',
      'tour noire',
      'fou noir',
      'cavalier noir',
      'pion noir',
    ]);
  });

  it('ajoute « sélectionnée » et « coup possible »', () => {
    const { tree } = monter({ selected: at('e2'), targets: movesFrom(depart, at('e2')) });
    expect(libelle(tree, 'e2')).toBe('e2, pion blanc, sélectionnée');
    expect(libelle(tree, 'e4')).toBe('e4, vide, coup possible');
    expect(libelle(tree, 'e3')).toBe('e3, vide, coup possible');
    expect(libelle(tree, 'd2')).toBe('d2, pion blanc');
  });

  it('signale une capture possible par la pièce visée', () => {
    const pos = parseFEN('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2');
    const { tree } = monter({ position: pos, selected: at('e4'), targets: movesFrom(pos, at('e4')) });
    expect(libelle(tree, 'd5')).toBe('d5, pion noir, coup possible');
  });

  it('signale le roi en échec', () => {
    const pos = parseFEN('4k3/4R3/8/8/8/8/8/4K3 b - - 0 1');
    const { tree } = monter({ position: pos });
    expect(libelle(tree, 'e8')).toBe('e8, roi noir, roi en échec');
    expect(libelle(tree, 'e1')).toBe('e1, roi blanc');
  });

  it('cumule les états dans un ordre stable', () => {
    expect(libelle_(4 + 8 * 7)).toBe('e8, roi noir, sélectionnée, coup possible, roi en échec');
  });

  it('donne à chaque case le rôle de bouton et son état de sélection', () => {
    const { tree } = monter({ selected: at('e2') });
    const toutes = new Set<string>();
    for (let carre = 0; carre < 64; carre += 1) {
      const c = tree.root.findByProps({ testID: `square-${squareName(carre)}` });
      expect(c.props.accessibilityRole).toBe('button');
      expect(typeof c.props.accessibilityLabel).toBe('string');
      toutes.add(c.props.accessibilityLabel);
    }
    // 64 libellés, tous différents : aucune case n'est indiscernable d'une autre
    expect(toutes.size).toBe(64);
    expect(tree.root.findByProps({ testID: 'square-e2' }).props.accessibilityState).toEqual({ selected: true });
    expect(tree.root.findByProps({ testID: 'square-e3' }).props.accessibilityState).toEqual({ selected: false });
  });

  it('ne change pas la taille tactile des cases', () => {
    const { tree } = monter();
    const style = tree.root.findByProps({ testID: 'square-e4' }).props.style;
    const plat = (Array.isArray(style) ? style : [style]).reduce((a: object, s: object) => ({ ...a, ...s }), {});
    expect(plat).toMatchObject({ width: 40, height: 40 });
  });

  it('conserve les identifiants de test existants', () => {
    const { tree } = monter({ arrows: [['e2', 'e4']], ghost: { square: at('e4'), piece: 'P' } });
    expect(tree.root.findAllByProps({ testID: 'square-e4' }).length).toBeGreaterThan(0);
    expect(tree.root.findAllByProps({ testID: 'ghost-e4' }).length).toBeGreaterThan(0);
    expect(tree.root.findAllByProps({ testID: 'arrow-overlay' }).length).toBeGreaterThan(0);
  });
});

/** `libelleCase` sans passer par le rendu, pour les combinaisons que la position de départ ne permet pas. */
function libelle_(carre: number): string {
  return libelleCase(carre, 'k', { selectionnee: true, cible: 1, echec: true });
}
