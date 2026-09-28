import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, type GestureResponderEvent, type ViewProps } from 'react-native';

/**
 * Glisser-déposer d'une pièce, sous forme de deux touchers.
 *
 * Le contrat des écrans ne change pas : ils ne connaissent que
 * `onPressSquare(case)`. Un glissement en produit donc deux, exactement
 * comme le toucher-toucher qu'il remplace :
 *
 *  1. au début du geste, `onPressSquare(caseDeDépart)` — l'écran sélectionne
 *     la pièce et montre ses cases d'arrivée ;
 *  2. à la fin, `onPressSquare(caseD'arrivée)` — l'écran joue le coup, le
 *     refuse en l'expliquant, ou change de sélection, comme après un toucher.
 *
 * Le composant ne connaît pas les règles. L'écran reste seul juge de ce qui
 * est jouable ; nous ne faisons que lui répéter des touchers.
 *
 * ### Un seul mécanisme pour le web et le natif : le système de « responder »
 *
 * `View` accepte partout `onStartShouldSetResponderCapture`,
 * `onMoveShouldSetResponderCapture`, `onResponderGrant/Move/Release/Terminate`.
 * React Native les fournit ; react-native-web les porte à l'identique au-dessus
 * des événements souris et tactiles du navigateur. Un seul jeu de gestionnaires
 * couvre donc iPhone Safari, Android, iOS natif et le bureau, et se teste en
 * les appelant directement. Les pointer events auraient exigé un second
 * chemin, natif, pour le même résultat.
 *
 * Deux détails de plateforme ne se règlent pas par le code, ils se règlent par
 * la configuration de la vue : sur le web, `touch-action: none` (sinon Safari
 * fait défiler la page sous le doigt et annule le geste), `user-select: none`
 * et `-webkit-touch-callout: none` (sinon un glissement sélectionne les
 * repères de coordonnées) ; sur le natif, `onGlisser` permet à l'écran de
 * figer sa `ScrollView`.
 *
 * ### Pourquoi on ne prend la main qu'après un seuil
 *
 * Les cases sont des `Pressable` et le toucher-toucher passe par elles : on ne
 * les remplace pas. Tant que le doigt n'a pas bougé de `SEUIL_GLISSEMENT`
 * pixels, on regarde sans rien faire ; un toucher reste donc un toucher, avec
 * son retour visuel et son clavier. Au-delà, on vole le geste à la case
 * (« capture » sur le déplacement), qui reçoit un `terminate` et n'appelle pas
 * `onPress`.
 */

/** Distance, en pixels, en dessous de laquelle un mouvement reste un toucher. */
export const SEUIL_GLISSEMENT = 6;

/**
 * Décalage vertical de la pièce au doigt, en cases, sur écran tactile.
 *
 * Sous le doigt, la pièce serait cachée par lui. On la remonte donc, et c'est
 * elle — pas le bout du doigt — qui désigne la case d'arrivée : la case
 * surlignée est ce que l'on voit, et la pièce tombe où elle est. À la souris
 * il n'y a pas de doigt à éviter, le décalage est nul.
 */
export const DECALAGE_TACTILE = 0.75;

/** Agrandissement de la pièce en vol, pour qu'elle se lise comme « soulevée ». */
export const ECHELLE_VOL = 1.25;

/** Durée pendant laquelle un `click` tardif sur la case de départ est ignoré. */
const DELAI_CLIC_FANTOME_MS = 350;

export interface Point {
  x: number;
  y: number;
}

/**
 * Case située sous le point (`x`, `y`), en pixels dans le repère de l'échiquier
 * (origine en haut à gauche), ou `null` hors de l'échiquier.
 *
 * Les bords sont exacts : `[0, taille)` est dedans, `taille` est déjà dehors.
 * La largeur d'une case est `taille / 8`, une division par une puissance de
 * deux, donc sans erreur d'arrondi : un point pile sur une frontière tombe
 * toujours dans la case qui commence là.
 */
export function caseSousPoint(x: number, y: number, taille: number, retourne: boolean): number | null {
  if (!(x >= 0 && y >= 0 && x < taille && y < taille)) return null;
  const cote = taille / 8;
  const colonne = Math.floor(x / cote);
  const ligne = Math.floor(y / cote);
  // rangée 8 en haut et colonne a à gauche, sauf si l'échiquier est retourné
  const fichier = retourne ? 7 - colonne : colonne;
  const rang = retourne ? ligne : 7 - ligne;
  return rang * 8 + fichier;
}

/** Centre d'une case, dans le même repère que `caseSousPoint`. */
export function centreDeCase(carre: number, taille: number, retourne: boolean): Point {
  const cote = taille / 8;
  const fichier = carre % 8;
  const rang = Math.floor(carre / 8);
  const colonne = retourne ? 7 - fichier : fichier;
  const ligne = retourne ? rang : 7 - rang;
  return { x: (colonne + 0.5) * cote, y: (ligne + 0.5) * cote };
}

/** Origine de l'échiquier dans le repère « page » des événements. */
type Noeud = {
  getBoundingClientRect?: () => { left: number; top: number };
  measure?: (
    rappel: (x: number, y: number, l: number, h: number, pageX: number, pageY: number) => void,
  ) => void;
};

/**
 * Mesure l'origine de l'échiquier dans le repère de `pageX`/`pageY`.
 *
 * Ces deux repères ne coïncident pas d'une plateforme à l'autre, d'où deux
 * mesures : sur le web `pageX` compte le défilement du document, pas
 * `getBoundingClientRect` ; sur le natif `measure` rend justement `pageX`.
 * `locationX` serait plus simple mais ne veut pas dire la même chose ici (relatif
 * à l'élément visé sur le natif, à l'élément qui écoute sur le web) — c'est la
 * raison pour laquelle on ne s'en sert pas.
 */
function mesurerOrigine(noeud: unknown, rappel: (origine: Point) => void): void {
  const n = noeud as Noeud | null;
  if (!n) return;
  if (Platform.OS === 'web' && typeof n.getBoundingClientRect === 'function') {
    const r = n.getBoundingClientRect();
    const fenetre = globalThis as { pageXOffset?: number; pageYOffset?: number };
    rappel({ x: r.left + (fenetre.pageXOffset ?? 0), y: r.top + (fenetre.pageYOffset ?? 0) });
  } else if (typeof n.measure === 'function') {
    n.measure((_x, _y, _l, _h, pageX, pageY) => rappel({ x: pageX, y: pageY }));
  }
}

/** Vrai pour un doigt : partout sur le natif, et sur le web pour les événements `touch*`. */
function estTactile(nativeEvent: { type?: string }): boolean {
  return Platform.OS !== 'web' || String(nativeEvent.type ?? '').startsWith('touch');
}

/** Un geste observé mais pas encore devenu un glissement. */
interface Attente {
  /** Point d'appui, dans le repère « page ». */
  depart: Point;
  tactile: boolean;
  origine: Point | null;
}

/** Un glissement en cours. */
interface Vol {
  depart: number;
  origine: Point;
  tactile: boolean;
  /** Dernier point connu (repère de l'échiquier), pour un relâchement sans coordonnées. */
  dernier: Point;
  sur: number | null;
}

/** Ce que l'échiquier affiche pendant un glissement. */
export interface EtatGlisse {
  depart: number;
  /** Case désignée en ce moment, ou `null` hors de l'échiquier. */
  sur: number | null;
}

interface Options {
  /** Vue de l'échiquier, pour mesurer son origine. */
  plateauRef: React.RefObject<unknown>;
  taille: number;
  retourne: boolean;
  /** Case que l'écran dit sélectionnée : c'est son verdict sur « cette pièce peut bouger ». */
  selectionnee: number | null;
  peutGlisser: (carre: number) => boolean;
  /** Faux : l'échiquier n'a pas de gestionnaire, il ne glisse rien. */
  actif: boolean;
  surAppui: (carre: number) => void;
  surGlisser?: (actif: boolean) => void;
}

type Gestes = Pick<
  ViewProps,
  | 'onStartShouldSetResponderCapture'
  | 'onMoveShouldSetResponderCapture'
  | 'onResponderGrant'
  | 'onResponderMove'
  | 'onResponderRelease'
  | 'onResponderTerminate'
  | 'onResponderTerminationRequest'
>;

export function useGlisserDeposer(options: Options) {
  // Les gestionnaires sont créés une fois : ils lisent les réglages à jour ici,
  // pour ne pas être recréés (donc ré-enregistrés) à chaque rendu.
  const courant = useRef(options);
  useLayoutEffect(() => {
    courant.current = options;
  });

  const attente = useRef<Attente | null>(null);
  const vol = useRef<Vol | null>(null);
  const dernierVol = useRef<{ carre: number; quand: number } | null>(null);
  const [glisse, setGlisse] = useState<EtatGlisse | null>(null);
  // La position de la pièce en vol change à chaque mouvement du doigt : elle
  // passe par une valeur animée, qui met la vue à jour sans nouveau rendu.
  const position = useRef(new Animated.ValueXY()).current;

  const terminer = useCallback(
    (arrivee: number | null) => {
      const v = vol.current;
      if (!v) return;
      vol.current = null;
      attente.current = null;
      dernierVol.current = { carre: v.depart, quand: Date.now() };
      setGlisse(null);
      const o = courant.current;
      o.surGlisser?.(false);

      // Le glissement n'a de sens que tant que l'écran garde la pièce
      // sélectionnée : sinon il a refusé de la prendre (pièce adverse, pas son
      // tour…) ou la position a changé sous le doigt. Dans ce cas on ne joue rien.
      if (o.selectionnee !== v.depart) return;

      // Relâcher sur la case de départ, ou hors de l'échiquier, ou sur un
      // geste annulé par le système : la pièce revient et reste sélectionnée,
      // comme après un simple toucher. Aucun second appel, donc aucun état
      // caché : l'écran montre ce qu'il montrerait après le premier toucher.
      if (arrivee === null || arrivee === v.depart) return;
      o.surAppui(arrivee);
    },
    [],
  );

  const gestes = useMemo<Gestes>(() => {
    /** Point du doigt dans le repère de l'échiquier, décalé si la pièce doit se lire au-dessus. */
    const dansPlateau = (e: GestureResponderEvent, v: Vol): Point => {
      const n = e.nativeEvent;
      if (!Number.isFinite(n.pageX) || !Number.isFinite(n.pageY)) return v.dernier;
      const decalage = v.tactile ? (DECALAGE_TACTILE * courant.current.taille) / 8 : 0;
      return { x: n.pageX - v.origine.x, y: n.pageY - v.origine.y - decalage };
    };

    return {
      onStartShouldSetResponderCapture: (e) => {
        // un deuxième doigt pendant un glissement n'est pas le nôtre
        if (vol.current) return false;
        const n = e.nativeEvent;
        if ((n.touches?.length ?? 1) > 1) {
          attente.current = null;
          return false;
        }
        const a: Attente = {
          depart: { x: n.pageX, y: n.pageY },
          tactile: estTactile(n as { type?: string }),
          origine: null,
        };
        attente.current = a;
        mesurerOrigine(courant.current.plateauRef.current, (o) => {
          a.origine = o;
        });
        // On observe seulement : la case garde le geste, et donc le toucher.
        return false;
      },

      onMoveShouldSetResponderCapture: (e) => {
        const a = attente.current;
        if (!a || vol.current) return false;
        const n = e.nativeEvent;
        if ((n.touches?.length ?? 1) > 1) {
          attente.current = null;
          return false;
        }
        if (Math.hypot(n.pageX - a.depart.x, n.pageY - a.depart.y) < SEUIL_GLISSEMENT) return false;
        // origine pas encore mesurée (asynchrone sur le natif) : au prochain mouvement
        if (!a.origine) return false;

        const o = courant.current;
        const carre = caseSousPoint(
          a.depart.x - a.origine.x,
          a.depart.y - a.origine.y,
          o.taille,
          o.retourne,
        );
        if (carre === null || !o.peutGlisser(carre)) {
          // pas une pièce à glisser : le geste reste un toucher, on cesse de le suivre
          attente.current = null;
          return false;
        }
        return true;
      },

      onResponderGrant: (e) => {
        const a = attente.current;
        if (!a || !a.origine || vol.current) return;
        attente.current = null;
        const o = courant.current;
        const depart = caseSousPoint(
          a.depart.x - a.origine.x,
          a.depart.y - a.origine.y,
          o.taille,
          o.retourne,
        );
        if (depart === null) return;

        const v: Vol = {
          depart,
          origine: a.origine,
          tactile: a.tactile,
          dernier: { x: 0, y: 0 },
          sur: depart,
        };
        vol.current = v;
        const p = dansPlateau(e, v);
        v.dernier = p;
        v.sur = caseSousPoint(p.x, p.y, o.taille, o.retourne);
        position.setValue(p);

        // Premier « toucher » : on demande à l'écran de sélectionner la pièce.
        // Si elle l'est déjà, la répéter la désélectionnerait sur les écrans
        // qui basculent — on ne rappelle donc pas.
        if (o.selectionnee !== depart) o.surAppui(depart);
        setGlisse({ depart, sur: v.sur });
        o.surGlisser?.(true);
      },

      onResponderMove: (e) => {
        const v = vol.current;
        if (!v) return;
        const p = dansPlateau(e, v);
        v.dernier = p;
        position.setValue(p);
        const o = courant.current;
        const sur = caseSousPoint(p.x, p.y, o.taille, o.retourne);
        if (sur !== v.sur) {
          v.sur = sur;
          setGlisse({ depart: v.depart, sur });
        }
      },

      onResponderRelease: (e) => {
        const v = vol.current;
        if (!v) return;
        const p = dansPlateau(e, v);
        const o = courant.current;
        terminer(caseSousPoint(p.x, p.y, o.taille, o.retourne));
      },

      // le système reprend le geste (appel, alerte, geste de la barre système) :
      // on annule proprement plutôt que de jouer un coup que l'on n'a pas vu finir
      onResponderTerminate: () => {
        attente.current = null;
        terminer(null);
      },

      // une fois le glissement engagé, ni une `ScrollView` ni un parent ne doit le voler
      onResponderTerminationRequest: () => !vol.current,
    };
  }, [position, terminer]);

  // Un échiquier démonté en plein geste ne doit pas laisser l'écran figé.
  useEffect(
    () => () => {
      if (vol.current) {
        vol.current = null;
        courant.current.surGlisser?.(false);
      }
    },
    [],
  );

  /**
   * Vrai pour le `click` qui suit un glissement relâché sur sa case de départ :
   * le navigateur le livre à cette case, dont le `Pressable` rappellerait
   * `onPressSquare` une seconde fois (et, sur un écran qui bascule, annulerait
   * la sélection que le glissement vient de faire).
   */
  const ignorerAppui = useCallback((carre: number): boolean => {
    const d = dernierVol.current;
    return Boolean(d && d.carre === carre && Date.now() - d.quand < DELAI_CLIC_FANTOME_MS);
  }, []);

  return {
    gestes: options.actif ? gestes : ({} as Gestes),
    glisse,
    position,
    ignorerAppui,
  };
}
