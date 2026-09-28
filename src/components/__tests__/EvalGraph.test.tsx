import React from 'react';
import renderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { Circle, Line } from 'react-native-svg';
import { EvalGraph, pointsCourbe, surfaceBlancs, traceCourbe } from '../EvalGraph';

describe('coordonnées de la courbe', () => {
  it('répartit les positions de bord à bord', () => {
    const p = pointsCourbe([0, 0, 0, 0, 0], 200, 80);
    expect(p.map((q) => q.x)).toEqual([0, 50, 100, 150, 200]);
  });

  it('centre une courbe d’un seul point', () => {
    expect(pointsCourbe([0], 200, 80)[0].x).toBe(100);
  });

  it('place l’égalité au milieu, l’avantage blanc en haut, l’avantage noir en bas', () => {
    const [egal, blanc, noir] = pointsCourbe([0, 300, -300], 100, 80);
    expect(egal.y).toBe(40);
    expect(blanc.y).toBeLessThan(40);
    expect(noir.y).toBeGreaterThan(40);
    // symétrie : +300 et −300 sont à égale distance du milieu
    expect(40 - blanc.y).toBeCloseTo(noir.y - 40, 9);
  });

  it('reste dans le cadre même sur un mat écrêté', () => {
    pointsCourbe([1000, -1000], 100, 80).forEach((q) => {
      expect(q.y).toBeGreaterThan(0);
      expect(q.y).toBeLessThan(80);
    });
  });

  it('aplatit les avantages écrasants : de +5 à +10 on monte moins que de 0 à +5', () => {
    const [zero, cinq, dix] = pointsCourbe([0, 500, 1000], 100, 80);
    expect(zero.y - cinq.y).toBeGreaterThan(cinq.y - dix.y);
  });

  it('ferme la surface des blancs par le bas du cadre', () => {
    const p = pointsCourbe([0, 100], 100, 80);
    const d = surfaceBlancs(p, 100, 80);
    expect(d.startsWith('M0.00 40.00')).toBe(true);
    expect(d.endsWith('L100 80L0 80Z')).toBe(true);
  });

  it('rend un tracé vide pour une courbe vide', () => {
    expect(surfaceBlancs([], 100, 80)).toBe('');
    expect(traceCourbe([])).toBe('');
  });
});

describe('EvalGraph', () => {
  const courbe = [20, 30, -100, -80, 600];

  const monter = (props: Partial<React.ComponentProps<typeof EvalGraph>> = {}) => {
    let arbre!: renderer.ReactTestRenderer;
    const onSelect = jest.fn();
    act(() => {
      arbre = renderer.create(
        <EvalGraph courbe={courbe} largeur={200} index={1} onSelect={onSelect} {...props} />,
      );
    });
    return { root: arbre.root, onSelect };
  };

  const toucher = (root: ReactTestInstance, i: number) =>
    act(() => {
      root.findAllByProps({ testID: `eval-zone-${i}` })[0].props.onPress();
    });

  it('signale la position touchée, quelle qu’elle soit', () => {
    const { root, onSelect } = monter();
    toucher(root, 0);
    toucher(root, 4);
    toucher(root, 2);
    expect(onSelect.mock.calls.map((c) => c[0])).toEqual([0, 4, 2]);
  });

  it('couvre toute la largeur sans chevauchement ni trou', () => {
    const { root } = monter();
    const zones = courbe.map((_, i) => root.findAllByProps({ testID: `eval-zone-${i}` })[0].props.style);
    let bord = 0;
    zones.forEach((z) => {
      expect(z.left).toBeCloseTo(bord, 9);
      bord = z.left + z.width;
    });
    expect(bord).toBeCloseTo(200, 9);
  });

  it('repère la position sélectionnée par une ligne verticale', () => {
    const { root } = monter({ index: 2 });
    const verticales = root.findAllByType(Line).filter((l) => l.props.x1 === l.props.x2);
    expect(verticales).toHaveLength(1);
    expect(verticales[0].props.x1).toBe(100);
  });

  it('pose un repère par marqueur, à la position demandée', () => {
    const { root } = monter({
      marqueurs: [
        { index: 2, couleur: '#e4574c' },
        { index: 4, couleur: '#d2723a' },
      ],
    });
    const ronds = root.findAllByType(Circle);
    expect(ronds).toHaveLength(2);
    expect(ronds.map((r) => r.props.cx)).toEqual([100, 200]);
  });

  it('borne l’indice sélectionné à la courbe', () => {
    expect(() => monter({ index: 99 })).not.toThrow();
    expect(() => monter({ index: -3 })).not.toThrow();
  });
});
