import React, { useCallback, useState } from 'react';
import { Platform, View } from 'react-native';
import renderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { ChessBoard } from '../ChessBoard';
import { SEUIL_GLISSEMENT, DECALAGE_TACTILE, caseSousPoint, centreDeCase } from '../GlisserDeposer';
import {
  START_FEN,
  makeMove,
  parseFEN,
  squareFromName as at,
  toFEN,
  type Position,
} from '../../chess/engine';
import { toucherCase } from '../../chess/interaction';

/**
 * Le glissement est testé comme le système de « responder » le pilote : on
 * appelle les gestionnaires de la racine dans l'ordre où le système les
 * appellerait (capture au début, capture sur déplacement, prise du geste,
 * déplacements, relâchement). Aucun outil de geste n'est simulé — c'est la
 * séquence réelle, sans intermédiaire.
 */

const ORIGINE = { x: 30, y: 200 };

/**
 * Dans ce moteur de test, la référence d'une `View` est une instance dont
 * `measure` est un `jest.fn()` muet : aucune plateforme ne lui répond. On lui
 * prête donc les réponses que donneraient le natif (`measure`, en repère
 * « page ») et le web (`getBoundingClientRect`, en repère « fenêtre »).
 */
let tailleMesuree = 320;
const decalagePage = () => (globalThis as { pageYOffset?: number }).pageYOffset ?? 0;
const protoVue = View.prototype as unknown as Record<string, unknown>;
const originaux = { measure: protoVue.measure, getBoundingClientRect: protoVue.getBoundingClientRect };
beforeAll(() => {
  protoVue.measure = (cb: (...n: number[]) => void) =>
    cb(0, 0, tailleMesuree, tailleMesuree, ORIGINE.x, ORIGINE.y);
  protoVue.getBoundingClientRect = () => ({ left: ORIGINE.x, top: ORIGINE.y - decalagePage() });
});
afterAll(() => {
  protoVue.measure = originaux.measure;
  protoVue.getBoundingClientRect = originaux.getBoundingClientRect;
});

interface Ecran {
  position: Position;
  selected: number | null;
  journal: number[];
  glisser: boolean[];
}

/**
 * Un écran minimal mais fidèle : il applique les vraies règles de toucher
 * (`toucherCase`), pour que le test dise ce que verrait un joueur, pas ce
 * qu'un double de test voudrait entendre.
 */
function EcranDeTest({
  sortie,
  taille,
  ...props
}: { sortie: Ecran; taille: number } & Partial<React.ComponentProps<typeof ChessBoard>>) {
  const [etat, setEtat] = useState<{ position: Position; selected: number | null }>({
    position: parseFEN(props.position ? toFEN(props.position) : START_FEN),
    selected: null,
  });
  sortie.position = etat.position;
  sortie.selected = etat.selected;

  const surCase = useCallback(
    (carre: number) => {
      sortie.journal.push(carre);
      setEtat((e) => {
        const d = toucherCase(e.position, e.selected, carre);
        if (d.type === 'coup') return { position: makeMove(e.position, d.move), selected: null };
        if (d.type === 'selection') return { ...e, selected: d.square };
        return { ...e, selected: null };
      });
    },
    [sortie],
  );
  const surGlisser = useCallback((actif: boolean) => sortie.glisser.push(actif), [sortie]);

  const cibles =
    etat.selected === null
      ? []
      : // cases d'arrivée calculées par le vrai moteur
        require('../../chess/engine').movesFrom(etat.position, etat.selected);

  return (
    <ChessBoard
      size={taille}
      {...props}
      position={etat.position}
      selected={etat.selected}
      targets={cibles}
      onPressSquare={surCase}
      onGlisser={surGlisser}
    />
  );
}

function monter(taille: number, props: Partial<React.ComponentProps<typeof ChessBoard>> = {}) {
  const sortie: Ecran = {
    position: parseFEN(START_FEN),
    selected: null,
    journal: [],
    glisser: [],
  };
  let tree!: renderer.ReactTestRenderer;
  tailleMesuree = taille;
  act(() => {
    tree = renderer.create(<EcranDeTest sortie={sortie} taille={taille} {...props} />);
  });
  const racine = () => tree.root.findByProps({ testID: 'plateau' });
  return { sortie, tree, racine, taille, flipped: Boolean(props.flipped) };
}

type Plateau = ReturnType<typeof monter>;

/** Un doigt (ou une souris) qui parcourt l'échiquier, sans rien savoir de son fonctionnement interne. */
function doigt(plateau: Plateau, type = 'touchstart') {
  let enVol = false;
  const evt = (x: number, y: number, touches = 1) =>
    ({
      nativeEvent: { pageX: x, pageY: y, type, touches: Array.from({ length: touches }, () => ({})) },
    }) as never;
  const h = () => plateau.racine().props;
  return {
    get enVol() {
      return enVol;
    },
    /** Ordonnée à donner au doigt pour que la pièce, remontée, tombe à `y`. */
    decale(y: number) {
      const tactile = Platform.OS !== 'web' || type.startsWith('touch');
      return tactile ? y + (DECALAGE_TACTILE * plateau.taille) / 8 : y;
    },
    /** Point que le doigt doit viser pour que la pièce désigne la case `nom`. */
    vise(nom: string) {
      const c = this.centre(nom);
      return { x: c.x, y: this.decale(c.y) };
    },
    /** Coordonnées de page du centre d'une case, dans l'échiquier. */
    centre(nom: string) {
      const c = centreDeCase(at(nom), plateau.taille, plateau.flipped);
      return { x: ORIGINE.x + c.x, y: ORIGINE.y + c.y };
    },
    appuyer(x: number, y: number) {
      act(() => {
        h().onStartShouldSetResponderCapture(evt(x, y));
      });
    },
    deplacer(x: number, y: number) {
      act(() => {
        if (!enVol) {
          if (h().onMoveShouldSetResponderCapture(evt(x, y))) {
            enVol = true;
            h().onResponderGrant(evt(x, y));
          }
        } else {
          h().onResponderMove(evt(x, y));
        }
      });
    },
    relacher(x: number, y: number) {
      act(() => {
        if (enVol) h().onResponderRelease(evt(x, y));
        enVol = false;
      });
    },
    interrompre() {
      act(() => {
        if (enVol) h().onResponderTerminate(evt(0, 0));
        enVol = false;
      });
    },
    /** Glisse d'un point à un autre par petites étapes, comme un vrai doigt. */
    glisser(de: { x: number; y: number }, vers: { x: number; y: number }, etapes = 8) {
      this.appuyer(de.x, de.y);
      for (let i = 1; i <= etapes; i += 1) {
        this.deplacer(de.x + ((vers.x - de.x) * i) / etapes, de.y + ((vers.y - de.y) * i) / etapes);
      }
      this.relacher(vers.x, vers.y);
    },
  };
}

/** Position, dans le repère de l'échiquier, et échelle de la pièce en vol. */
const enVol = (p: Plateau) => {
  const vol = p.tree.root.findByProps({ testID: 'piece-en-vol' });
  const transform = (vol.props.style as Array<{ transform?: unknown[] }>)
    .flat()
    .find((s) => s?.transform)!.transform as Array<Record<string, { __getValue(): number } | number>>;
  const lire = (cle: string) => {
    const v = transform.find((t) => cle in t)![cle];
    return typeof v === 'number' ? v : v.__getValue();
  };
  return { x: lire('translateX'), y: lire('translateY'), echelle: lire('scale') };
};

describe('géométrie du glissement', () => {
  it.each([240, 320, 397, 460])('rend la bonne case au centre de chacune des 64 (taille %i)', (taille) => {
    [false, true].forEach((retourne) => {
      for (let carre = 0; carre < 64; carre += 1) {
        const c = centreDeCase(carre, taille, retourne);
        expect(caseSousPoint(c.x, c.y, taille, retourne)).toBe(carre);
      }
    });
  });

  it.each([240, 397])('tombe juste au pixel près sur chaque frontière (taille %i)', (taille) => {
    const cote = taille / 8;
    [false, true].forEach((retourne) => {
      for (let k = 1; k < 8; k += 1) {
        const y = 3 * cote;
        // pile sur la frontière : la case qui commence là
        const apres = caseSousPoint(k * cote, y, taille, retourne);
        // un cheveu avant : la case précédente
        const avant = caseSousPoint(k * cote - 1e-6, y, taille, retourne);
        expect(apres).not.toBe(avant);
        expect(apres).toBe(caseSousPoint(centreDeCase(apres as number, taille, retourne).x, y, taille, retourne));
      }
    });
  });

  it('traite les bords de l’échiquier : 0 est dedans, la taille est dehors', () => {
    [false, true].forEach((retourne) => {
      expect(caseSousPoint(0, 0, 320, retourne)).not.toBeNull();
      expect(caseSousPoint(319.999, 319.999, 320, retourne)).not.toBeNull();
      expect(caseSousPoint(320, 10, 320, retourne)).toBeNull();
      expect(caseSousPoint(10, 320, 320, retourne)).toBeNull();
      expect(caseSousPoint(-0.001, 10, 320, retourne)).toBeNull();
      expect(caseSousPoint(10, -0.001, 320, retourne)).toBeNull();
      expect(caseSousPoint(Number.NaN, 10, 320, retourne)).toBeNull();
    });
  });

  it('place a1 en bas à gauche, et h8 en bas à gauche une fois retourné', () => {
    expect(caseSousPoint(1, 319, 320, false)).toBe(at('a1'));
    expect(caseSousPoint(1, 319, 320, true)).toBe(at('h8'));
    expect(caseSousPoint(319, 1, 320, false)).toBe(at('h8'));
    expect(caseSousPoint(319, 1, 320, true)).toBe(at('a1'));
  });
});

describe('glisser-déposer', () => {
  it('joue d2-d4 en glissant, avec deux toucher : départ puis arrivée', () => {
    const p = monter(320);
    const d = doigt(p);
    d.glisser(d.centre('d2'), d.vise('d4'));

    expect(p.sortie.journal).toEqual([at('d2'), at('d4')]);
    expect(toFEN(p.sortie.position).split(' ')[0]).toBe('rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR');
    expect(p.sortie.selected).toBeNull();
  });

  it('montre les cases d’arrivée dès le début du geste, avant tout relâchement', () => {
    const p = monter(320);
    const d = doigt(p);
    const depart = d.centre('d2');
    d.appuyer(depart.x, depart.y);
    d.deplacer(depart.x, depart.y - 20);
    expect(p.sortie.journal).toEqual([at('d2')]);
    expect(p.sortie.selected).toBe(at('d2'));
    // la pièce vole, la case de départ garde sa pièce, estompée
    expect(p.tree.root.findAllByProps({ testID: 'piece-en-vol' }).length).toBeGreaterThan(0);
    d.relacher(depart.x, depart.y - 20);
  });

  describe('seuil', () => {
    it('ne commence pas sous le seuil : un toucher reste un toucher', () => {
      const p = monter(320);
      const d = doigt(p);
      const c = d.centre('d2');
      d.appuyer(c.x, c.y);
      d.deplacer(c.x + SEUIL_GLISSEMENT - 1, c.y);
      d.relacher(c.x + SEUIL_GLISSEMENT - 1, c.y);
      expect(d.enVol).toBe(false);
      expect(p.sortie.journal).toEqual([]);
      expect(p.sortie.glisser).toEqual([]);
      // le toucher-toucher passe toujours par les cases
      act(() => p.tree.root.findByProps({ testID: 'square-d2' }).props.onPress());
      act(() => p.tree.root.findByProps({ testID: 'square-d4' }).props.onPress());
      expect(toFEN(p.sortie.position)).toContain('3P4');
    });

    it('commence pile au seuil', () => {
      const p = monter(320);
      const d = doigt(p);
      const c = d.centre('d2');
      d.appuyer(c.x, c.y);
      d.deplacer(c.x, c.y - SEUIL_GLISSEMENT);
      expect(d.enVol).toBe(true);
      d.relacher(c.x, c.y - SEUIL_GLISSEMENT);
    });

    it('compte la distance depuis le point d’appui, pas depuis le dernier déplacement', () => {
      const p = monter(320);
      const d = doigt(p);
      const c = d.centre('d2');
      d.appuyer(c.x, c.y);
      // dix petits pas de 1 px : chacun sous le seuil, l'ensemble non
      for (let i = 1; i <= 10; i += 1) d.deplacer(c.x, c.y - i);
      expect(d.enVol).toBe(true);
      d.relacher(c.x, c.y - 10);
    });
  });

  describe('fin du geste', () => {
    it('relâcher sur la case de départ sélectionne la pièce, comme un toucher', () => {
      const p = monter(320);
      const d = doigt(p);
      const c = d.centre('e2');
      d.appuyer(c.x, c.y);
      d.deplacer(c.x, c.y - 30);
      d.deplacer(c.x, d.decale(c.y));
      d.relacher(c.x, d.decale(c.y));
      // un seul appel : le départ. Rien à l'arrivée, la pièce reste sélectionnée.
      expect(p.sortie.journal).toEqual([at('e2')]);
      expect(p.sortie.selected).toBe(at('e2'));
      expect(toFEN(p.sortie.position)).toBe(START_FEN);
    });

    it('hors de l’échiquier : rien n’est joué, l’état reste cohérent (pièce sélectionnée)', () => {
      const p = monter(320);
      const d = doigt(p);
      const depart = d.centre('d2');
      d.glisser(depart, { x: ORIGINE.x + 500, y: ORIGINE.y + 200 });
      expect(p.sortie.journal).toEqual([at('d2')]);
      expect(toFEN(p.sortie.position)).toBe(START_FEN);
      expect(p.sortie.selected).toBe(at('d2'));
      expect(p.tree.root.findAllByProps({ testID: 'piece-en-vol' })).toHaveLength(0);
      expect(p.sortie.glisser).toEqual([true, false]);
    });

    it('vers une case illégale : ne joue rien et laisse l’écran expliquer, comme après un toucher', () => {
      const p = monter(320);
      const d = doigt(p);
      d.glisser(d.centre('d2'), d.vise('d5'));
      expect(p.sortie.journal).toEqual([at('d2'), at('d5')]);
      expect(toFEN(p.sortie.position)).toBe(START_FEN);
      // l'écran de test désélectionne sur un refus, comme le fait l'écran de jeu
      expect(p.sortie.selected).toBeNull();
      expect(p.tree.root.findAllByProps({ testID: 'piece-en-vol' })).toHaveLength(0);
    });

    it('annulé par le système : aucun coup, pièce reposée', () => {
      const p = monter(320);
      const d = doigt(p);
      const c = d.centre('d2');
      d.appuyer(c.x, c.y);
      d.deplacer(c.x, c.y - 40);
      d.interrompre();
      expect(p.sortie.journal).toEqual([at('d2')]);
      expect(toFEN(p.sortie.position)).toBe(START_FEN);
      expect(p.sortie.glisser).toEqual([true, false]);
      expect(p.tree.root.findAllByProps({ testID: 'piece-en-vol' })).toHaveLength(0);
    });

    it('permet d’enchaîner deux glissements', () => {
      const p = monter(320);
      const d = doigt(p);
      d.glisser(d.centre('e2'), d.vise('e4'));
      // les noirs : le pion d7 n'est pas au trait avant que l'écran ait rendu la main
      d.glisser(d.centre('d2'), d.vise('d4'));
      // c'est aux noirs de jouer : d2 n'est pas glissable, rien ne bouge
      expect(toFEN(p.sortie.position).split(' ')[0]).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR');
      d.glisser(d.centre('d7'), d.vise('d5'));
      expect(toFEN(p.sortie.position).split(' ')[0]).toBe('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR');
    });
  });

  describe('qui peut glisser', () => {
    it('ne saisit pas une pièce du camp qui n’a pas le trait', () => {
      const p = monter(320);
      const d = doigt(p);
      d.glisser(d.centre('d7'), d.vise('d5'));
      expect(p.sortie.journal).toEqual([]);
      expect(p.sortie.glisser).toEqual([]);
    });

    it('ne saisit pas une case vide', () => {
      const p = monter(320);
      const d = doigt(p);
      d.glisser(d.centre('d4'), d.vise('d5'));
      expect(p.sortie.journal).toEqual([]);
    });

    it('obéit à `peutGlisser` quand l’écran en fournit une', () => {
      const p = monter(320, { peutGlisser: (carre) => carre === at('g1') });
      const d = doigt(p);
      d.glisser(d.centre('d2'), d.vise('d4'));
      expect(p.sortie.journal).toEqual([]);
      d.glisser(d.centre('g1'), d.vise('f3'));
      expect(p.sortie.journal).toEqual([at('g1'), at('f3')]);
    });

    it('n’ajoute pas de coup si l’écran refuse de sélectionner la pièce', () => {
      const surCase = jest.fn();
      let tree!: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(
          <ChessBoard position={parseFEN(START_FEN)} size={320} selected={null} onPressSquare={surCase} />,
        );
      });
      const p: Plateau = { sortie: null as never, tree, racine: () => tree.root.findByProps({ testID: 'plateau' }), taille: 320, flipped: false };
      const d = doigt(p);
      d.glisser(d.centre('d2'), d.vise('d4'));
      // le départ a été demandé, l'écran n'a pas suivi : on n'envoie pas de coup à l'aveugle
      expect(surCase).toHaveBeenCalledTimes(1);
      expect(surCase).toHaveBeenCalledWith(at('d2'));
      expect(tree.root.findAllByProps({ testID: 'piece-en-vol' })).toHaveLength(0);
    });

    it('n’appelle pas le départ une seconde fois si la pièce est déjà sélectionnée', () => {
      const p = monter(320);
      act(() => p.tree.root.findByProps({ testID: 'square-d2' }).props.onPress());
      expect(p.sortie.journal).toEqual([at('d2')]);
      const d = doigt(p);
      d.glisser(d.centre('d2'), d.vise('d4'));
      // pas de rappel du départ (il aurait pu désélectionner) : le seul appel ajouté est l'arrivée
      expect(p.sortie.journal).toEqual([at('d2'), at('d4')]);
      expect(toFEN(p.sortie.position)).toContain('3P4');
    });

    it('reste inerte sans gestionnaire', () => {
      let tree!: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(<ChessBoard position={parseFEN(START_FEN)} size={320} />);
      });
      expect(tree.root.findByProps({ testID: 'plateau' }).props.onStartShouldSetResponderCapture).toBeUndefined();
    });
  });

  describe('plusieurs doigts', () => {
    it('ignore un deuxième doigt posé pendant le glissement', () => {
      const p = monter(320);
      const d = doigt(p);
      const c = d.centre('d2');
      d.appuyer(c.x, c.y);
      d.deplacer(c.x, c.y - 20);
      const retour = p.racine().props.onStartShouldSetResponderCapture({
        nativeEvent: { pageX: 0, pageY: 0, type: 'touchstart', touches: [{}, {}] },
      });
      expect(retour).toBe(false);
      d.relacher(c.x, c.y - 20);
      expect(p.sortie.journal).toHaveLength(2);
    });

    it('n’engage pas de glissement si deux doigts sont posés dès le départ', () => {
      const p = monter(320);
      const c = doigt(p).centre('d2');
      act(() => {
        p.racine().props.onStartShouldSetResponderCapture({
          nativeEvent: { pageX: c.x, pageY: c.y, type: 'touchstart', touches: [{}, {}] },
        });
      });
      const prise = p.racine().props.onMoveShouldSetResponderCapture({
        nativeEvent: { pageX: c.x, pageY: c.y - 30, type: 'touchmove', touches: [{}, {}] },
      });
      expect(prise).toBe(false);
    });
  });

  describe('pièce en vol', () => {
    it('suit le doigt à la souris, centrée dessus, et agrandie', () => {
      jest.replaceProperty(Platform, 'OS', 'web');
      const p = monter(320);
      const d = doigt(p, 'mousedown');
      const c = d.centre('d2');
      d.appuyer(c.x, c.y);
      d.deplacer(c.x + 10, c.y - 30);
      const s = enVol(p);
      // repère de l'échiquier : origine retranchée, aucun décalage vertical à la souris
      expect(s.x).toBeCloseTo(c.x + 10 - ORIGINE.x);
      expect(s.y).toBeCloseTo(c.y - 30 - ORIGINE.y);
      expect(s.echelle).toBeGreaterThan(1);
      d.deplacer(c.x + 50, c.y - 90);
      expect(enVol(p).x).toBeCloseTo(c.x + 50 - ORIGINE.x);
      d.relacher(c.x + 50, c.y - 90);
      jest.restoreAllMocks();
    });

    it('se place au-dessus du doigt sur écran tactile, et c’est elle qui désigne la case', () => {
      const p = monter(320);
      const d = doigt(p, 'touchstart');
      const c = d.centre('d2');
      d.appuyer(c.x, c.y);
      d.deplacer(c.x, c.y - 30);
      expect(enVol(p).y).toBeCloseTo(c.y - 30 - ORIGINE.y - DECALAGE_TACTILE * 40);

      // le doigt est sous d4 d'un demi-décalage : la pièce, elle, est sur d4
      const cible = d.vise('d4');
      d.deplacer(cible.x, cible.y);
      d.relacher(cible.x, cible.y);
      expect(toFEN(p.sortie.position)).toContain('3P4');
    });
  });

  describe('échiquier retourné', () => {
    it('joue d7-d5 depuis la vue des noirs', () => {
      const p = monter(320, { flipped: true, position: parseFEN('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1') });
      const d = doigt(p);
      d.glisser(d.centre('d7'), d.vise('d5'));
      expect(toFEN(p.sortie.position).split(' ')[0]).toBe('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR');
    });

    it('le centre visuel d’une case est bien à l’envers', () => {
      // en vue des noirs, a1 est en haut à droite
      const c = centreDeCase(at('a1'), 320, true);
      expect(c.x).toBeGreaterThan(280);
      expect(c.y).toBeLessThan(40);
    });
  });

  describe.each([240, 397])('taille %i', (taille) => {
    it('joue d2-d4 et g1-f3 aux deux orientations', () => {
      [false, true].forEach((retourne) => {
        const p = monter(taille, retourne ? { flipped: true } : {});
        const d = doigt(p);
        d.glisser(d.centre('g1'), d.vise('f3'));
        expect(toFEN(p.sortie.position).split(' ')[0]).toBe('rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R');
      });
    });

    it('accepte un lâcher sur le dernier pixel de l’échiquier, et refuse le suivant', () => {
      const p = monter(taille);
      const d = doigt(p);
      d.glisser(d.centre('g1'), { x: ORIGINE.x + taille - 0.01, y: d.decale(ORIGINE.y + taille - 0.01) });
      // dernier pixel en bas à droite : h1
      expect(p.sortie.journal).toEqual([at('g1'), at('h1')]);

      const dehors = monter(taille);
      const d2 = doigt(dehors);
      d2.glisser(d2.centre('g1'), { x: ORIGINE.x + taille, y: d2.decale(ORIGINE.y + taille - 0.01) });
      expect(dehors.sortie.journal).toEqual([at('g1')]);
    });
  });

  describe('clic tardif du navigateur', () => {
    it('ignore le `click` qui suit un glissement relâché sur sa case de départ', () => {
      const p = monter(320);
      const d = doigt(p);
      const c = d.centre('e2');
      d.appuyer(c.x, c.y);
      d.deplacer(c.x, c.y - 30);
      d.deplacer(c.x, d.decale(c.y));
      d.relacher(c.x, d.decale(c.y));
      const avant = p.sortie.journal.length;
      act(() => p.tree.root.findByProps({ testID: 'square-e2' }).props.onPress());
      expect(p.sortie.journal).toHaveLength(avant);
    });

    it('laisse passer un vrai toucher sur une autre case juste après', () => {
      const p = monter(320);
      const d = doigt(p);
      d.glisser(d.centre('e2'), d.vise('e4'));
      const avant = p.sortie.journal.length;
      act(() => p.tree.root.findByProps({ testID: 'square-d7' }).props.onPress());
      expect(p.sortie.journal).toHaveLength(avant + 1);
    });
  });

  describe('avertit l’écran', () => {
    it('signale le début et la fin du glissement', () => {
      const p = monter(320);
      const d = doigt(p);
      d.glisser(d.centre('e2'), d.vise('e4'));
      expect(p.sortie.glisser).toEqual([true, false]);
    });

    it('rend la main à l’écran si l’échiquier disparaît en plein geste', () => {
      const p = monter(320);
      const d = doigt(p);
      const c = d.centre('e2');
      d.appuyer(c.x, c.y);
      d.deplacer(c.x, c.y - 30);
      expect(p.sortie.glisser).toEqual([true]);
      act(() => p.tree.unmount());
      expect(p.sortie.glisser).toEqual([true, false]);
    });

    it('refuse qu’on lui reprenne le geste une fois engagé', () => {
      const p = monter(320);
      const d = doigt(p);
      const c = d.centre('e2');
      expect(p.racine().props.onResponderTerminationRequest()).toBe(true);
      d.appuyer(c.x, c.y);
      d.deplacer(c.x, c.y - 30);
      expect(p.racine().props.onResponderTerminationRequest()).toBe(false);
      d.relacher(c.x, c.y - 30);
    });
  });
});

describe('sur le web', () => {
  const OS = Platform.OS;
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'web');
  });
  afterEach(() => {
    jest.restoreAllMocks();
    (globalThis as { pageYOffset?: number }).pageYOffset = 0;
    expect(Platform.OS).toBe(OS);
  });

  it('pose touch-action, user-select et touch-callout sur l’échiquier', () => {
    const p = monter(320);
    const style = (p.racine().props.style as object[]).filter(Boolean).reduce((a, s) => ({ ...a, ...s }), {}) as Record<string, string>;
    expect(style.touchAction).toBe('none');
    expect(style.userSelect).toBe('none');
    expect(style.WebkitTouchCallout).toBe('none');
  });

  it('n’en pose aucun sur natif', () => {
    jest.restoreAllMocks();
    const p = monter(320);
    const style = (p.racine().props.style as object[]).filter(Boolean).reduce((a, s) => ({ ...a, ...s }), {}) as Record<string, string>;
    expect(style.touchAction).toBeUndefined();
  });

  it('tient compte du défilement de la page pour situer le doigt', () => {
    // la page est défilée de 120 px : `pageY` compte ce défilement, `getBoundingClientRect` non
    (globalThis as { pageYOffset?: number }).pageYOffset = 120;
    const p = monter(320);
    const d = doigt(p, 'mousedown');
    d.glisser(d.centre('d2'), d.vise('d4'));
    expect(toFEN(p.sortie.position).split(' ')[0]).toBe('rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR');
  });

  it('un événement tactile remonte la pièce, un événement souris ne la décale pas', () => {
    const p = monter(320);
    const c = doigt(p, 'mousedown').centre('d2');
    const mesure = (type: string) => {
      const d = doigt(p, type);
      d.appuyer(c.x, c.y);
      d.deplacer(c.x, c.y - 20);
      const y = enVol(p).y;
      d.relacher(c.x, c.y - 20);
      return y;
    };
    const souris = mesure('mousedown');
    const tactile = mesure('touchstart');
    expect(souris).toBeCloseTo(c.y - 20 - ORIGINE.y);
    expect(tactile).toBeCloseTo(souris - DECALAGE_TACTILE * 40);
  });
});
