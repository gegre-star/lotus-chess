/**
 * Revue de partie, dans l'esprit de chess.com et de lichess.
 *
 * Le composant reçoit une revue déjà calculée (`analyserPartie`) et ne fait
 * qu'afficher et naviguer : l'analyse se fait avant, avec sa barre de
 * progression, dans l'écran qui l'héberge.
 *
 * **Ce que montre l'échiquier.** La position choisie est celle d'*avant* le
 * coup commenté, pas d'après. C'est la seule où le coup joué (flèche rouge) et
 * le meilleur coup (flèche verte) sont tous deux valables : après le coup, la
 * pièce a bougé et la flèche du meilleur coup partirait d'une case qui ne
 * correspond plus à rien. La position finale (indice N) n'a pas de coup à
 * commenter et s'affiche seule.
 *
 * **La meilleure suite.** « Voir la meilleure suite » déroule la variante
 * principale du moteur depuis cette position, coup par coup. Cet état est
 * local au composant (il n'a aucun sens hors de l'écran) ; « Retour à la
 * partie » ramène à la même position de la partie.
 *
 * À monter comme contenu principal d'un écran : le composant porte son propre
 * défilement vertical et ne demande à son parent qu'une hauteur. Il tient à
 * 320 px de large : chaque bloc a exactement la largeur de l'échiquier
 * (`taille`, que l'appelant borne à la largeur de l'écran) et les textes
 * passent à la ligne.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChessBoard, type Arrow } from './ChessBoard';
import { EvalGraph, type MarqueurCourbe } from './EvalGraph';
import { Action } from './UI';
import { C } from './theme';
import type { Color, Position } from '../chess/engine';
import { squareFromName } from '../chess/engine';
import type { BoardTheme } from '../chess/progress';
import type { Verdict } from '../chess/coaching';
import type { CoupRevu, RevueComplete } from '../analysis/review';
import {
  ETAT_INITIAL,
  estFaute,
  fauteVoisine,
  jouerVariante,
  naviguer,
  numeroter,
  type ActionRevue,
  type EtatRevue,
} from '../analysis/navigation';
import { toUci } from '../analysis/local';
import { CATEGORIES, NOM_CATEGORIE, libelleEval } from '../analysis/statistiques';

/** Couleur de chaque verdict : la même dans la liste, le tableau et la courbe. */
export const COULEUR_VERDICT: Record<Verdict, string> = {
  brillant: C.gold,
  bon: C.green,
  imprecision: C.blue,
  erreur: '#d2723a',
  gaffe: C.red,
};

export interface RevueDePartieProps {
  /** Résultat de `analyserPartie`. */
  revue: RevueComplete;
  /**
   * Position AVANT chaque demi-coup, puis la position finale : N + 1
   * éléments pour N demi-coups (`positions[i]` est celle où se joue
   * `revue.coups[i]`).
   */
  positions: Position[];
  /** Camp de l'élève : ses erreurs sont celles que « Erreur suivante » parcourt. */
  joueur: Color;
  /** Largeur de l'échiquier en pixels ; tous les blocs prennent cette largeur. */
  taille: number;
  /** Thème de l'échiquier (celui des réglages). */
  theme?: BoardTheme;
  /** Afficher les coordonnées de l'échiquier (vrai par défaut). */
  coords?: boolean;
  /** Vue depuis les noirs. Par défaut, vrai quand l'élève joue les noirs. */
  flipped?: boolean;
  /** Noms affichés au-dessus de la précision de chaque camp. */
  noms?: { blancs: string; noirs: string };
  /** Bouton « Fermer ». */
  onFermer: () => void;
  /** Bouton « Rejouer » : absent, le bouton n'est pas affiché. */
  onRejouer?: () => void;
  /** Position affichée à l'ouverture (0 par défaut). */
  indexInitial?: number;
}

const FAUTIF = new Set<Verdict>(['imprecision', 'erreur', 'gaffe']);

/** Flèche « départ → arrivée » depuis un coup UCI. */
const fleche = (uci: string, couleur: string): Arrow => [uci.slice(0, 2), uci.slice(2, 4), couleur];

/**
 * Flèches de la position : en rouge le coup joué, en vert celui qu'il fallait
 * jouer. Sur un bon coup une seule flèche — deux identiques n'apprendraient
 * rien — dans la couleur de son verdict.
 */
export function flechesDuCoup(coup: CoupRevu): Arrow[] {
  const fautif = FAUTIF.has(coup.verdict);
  if (!fautif || !coup.meilleur || coup.meilleur === coup.joue) {
    return [fleche(coup.joue, COULEUR_VERDICT[coup.verdict])];
  }
  return [fleche(coup.joue, C.red), fleche(coup.meilleur, C.green)];
}

/** Repères de la courbe : une pastille sur chaque erreur ou gaffe, des deux camps. */
export function marqueursDeFautes(coups: readonly CoupRevu[]): MarqueurCourbe[] {
  return coups.flatMap((c, i) => (estFaute(c.verdict) ? [{ index: i, couleur: COULEUR_VERDICT[c.verdict] }] : []));
}

const pourcent = (x: number | null): string => (x === null ? '–' : `${Math.round(x)} %`);

export function RevueDePartie({
  revue,
  positions,
  joueur,
  taille,
  theme = 'foret',
  coords = true,
  flipped,
  noms = { blancs: 'Blancs', noirs: 'Noirs' },
  onFermer,
  onRejouer,
  indexInitial = 0,
}: RevueDePartieProps) {
  const dernier = revue.coups.length;
  const [etat, setEtat] = useState<EtatRevue>({
    ...ETAT_INITIAL,
    index: Math.min(Math.max(indexInitial, 0), dernier),
  });

  const coup: CoupRevu | null = etat.index < dernier ? revue.coups[etat.index] : null;
  const avant = positions[etat.index] ?? positions[positions.length - 1];

  // la variante ne dépend que de la position choisie : on ne la rejoue pas à chaque rendu
  const variante = useMemo(
    () => (coup && coup.pv.length > 0 ? jouerVariante(avant, coup.pv) : null),
    [coup, avant],
  );
  const longueurSuite = variante?.coups.length ?? 0;

  const aller = useCallback(
    (action: ActionRevue) =>
      setEtat((e) => naviguer(e, action, { coups: revue.coups, joueur, longueurSuite })),
    [revue.coups, joueur, longueurSuite],
  );

  const enSuite = etat.suite !== null && variante !== null;
  const positionAffichee = enSuite ? variante.positions[etat.suite as number] : avant;

  // trait discret sur le dernier coup joué : dans la partie, celui qui a mené à
  // la position ; dans la variante, celui qu'on vient de dérouler
  const dernierCoup = ((): { from: number; to: number } | null => {
    if (enSuite) {
      const m = (etat.suite as number) > 0 ? variante.coups[(etat.suite as number) - 1] : null;
      return m ? { from: m.from, to: m.to } : null;
    }
    const precedent = etat.index > 0 ? revue.coups[etat.index - 1] : null;
    return precedent
      ? { from: squareFromName(precedent.joue.slice(0, 2)), to: squareFromName(precedent.joue.slice(2, 4)) }
      : null;
  })();

  const fleches: Arrow[] = enSuite
    ? (() => {
        const prochain = variante.coups[etat.suite as number];
        return prochain ? [fleche(toUci(prochain), C.green)] : [];
      })()
    : coup
      ? flechesDuCoup(coup)
      : [];

  const nom = (camp: Color) => (camp === 'w' ? noms.blancs : noms.noirs);
  const suivante = fauteVoisine(revue.coups, etat.index, joueur, 1);
  const marqueurs = useMemo(() => marqueursDeFautes(revue.coups), [revue.coups]);

  const colonne = { width: taille, alignSelf: 'center' as const };

  return (
    <ScrollView
      style={styles.racine}
      contentContainerStyle={styles.contenu}
      testID="revue-de-partie"
    >
      {/* ---- en-tête ---- */}
      <View style={[colonne, styles.entete]}>
        <Text style={styles.titrePage}>Revue de la partie</Text>
        <Pressable
          testID="revue-fermer"
          accessibilityRole="button"
          onPress={onFermer}
          style={styles.fermer}
        >
          <Text style={styles.fermerTexte}>Fermer</Text>
        </Pressable>
      </View>

      {/* ---- précision des deux camps ---- */}
      <View style={[colonne, styles.precisions]}>
        {(['w', 'b'] as const).map((camp) => (
          <View key={camp} style={styles.precision} testID={`revue-precision-${camp}`}>
            <Text style={styles.precisionNom} numberOfLines={1}>
              {nom(camp)}
              {camp === joueur ? ' (toi)' : ''}
            </Text>
            <Text style={styles.precisionValeur}>{pourcent(revue.precision[camp])}</Text>
            <Text style={styles.precisionLibelle}>précision</Text>
          </View>
        ))}
      </View>
      <View style={[colonne, { marginTop: 4 }]}>
        <Text style={styles.moteur}>
          {revue.moteur === 'stockfish' ? 'Analyse Stockfish' : 'Analyse locale, moins précise'}
          {revue.profondeur > 0 ? ` · profondeur ${revue.profondeur}` : ''}
        </Text>
      </View>

      {/* ---- courbe d'évaluation ---- */}
      <View style={[colonne, { marginTop: 10 }]}>
        <EvalGraph
          courbe={revue.courbe}
          largeur={taille}
          index={etat.index}
          marqueurs={marqueurs}
          onSelect={(i) => aller({ type: 'aller', index: i })}
        />
      </View>

      {/* ---- position ---- */}
      <View style={[colonne, styles.legende]}>
        <Text style={styles.legendeTexte} testID="revue-position">
          {enSuite
            ? `Meilleure suite · coup ${etat.suite}/${longueurSuite}`
            : coup
              ? `Avant ${numeroter(avant)} ${coup.san} · ${nom(coup.camp)}`
              : 'Position finale'}
        </Text>
        <Text style={styles.evaluation} testID="revue-eval">
          {libelleEval(revue.scores[etat.index] ?? 0)}
        </Text>
      </View>
      <View style={{ alignSelf: 'center', marginTop: 4 }}>
        <ChessBoard
          position={positionAffichee}
          size={taille}
          theme={theme}
          showCoords={coords}
          flipped={flipped ?? joueur === 'b'}
          lastMove={dernierCoup}
          arrows={fleches}
        />
      </View>

      {/* ---- commentaire du coach ---- */}
      <View style={[colonne, styles.carte]}>
        {enSuite ? (
          <>
            <Text style={styles.coupTitre}>Ce que le moteur aurait joué</Text>
            <Text style={styles.texte} testID="revue-texte">
              {ligneDeVariante(avant, variante.sans, etat.suite as number)}
            </Text>
          </>
        ) : coup ? (
          <>
            <View style={styles.coupTitreLigne}>
              <View style={[styles.pastille, { backgroundColor: COULEUR_VERDICT[coup.verdict] }]} />
              <Text style={styles.coupTitre} testID="revue-titre">
                {numeroter(avant)} {coup.san} — {coup.titre}
              </Text>
            </View>
            <Text style={styles.texte} testID="revue-texte">
              {coup.texte}
            </Text>
            {FAUTIF.has(coup.verdict) && coup.meilleur && coup.meilleur !== coup.joue ? (
              <Text style={[styles.texte, { color: C.green }]} testID="revue-meilleur">
                Meilleur coup : {coup.meilleurSan ?? coup.meilleur}
                {'\n'}
                <Text style={{ color: C.muted }}>Flèche verte : le meilleur coup. Flèche rouge : le coup joué.</Text>
              </Text>
            ) : null}
            {revue.critique === etat.index ? (
              <Text style={[styles.texte, { color: C.gold }]} testID="revue-critique">
                C’est le moment critique de la partie.
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.texte} testID="revue-texte">
            Fin de la partie. Touche la courbe ou la liste pour revoir un coup.
          </Text>
        )}
      </View>

      {/* ---- navigation ---- */}
      <View style={[colonne, styles.barre]}>
        <Action
          testID="revue-precedent"
          label="◀ Précédent"
          onPress={() => aller({ type: 'precedent' })}
          disabled={enSuite ? etat.suite === 0 : etat.index === 0}
        />
        <Action
          testID="revue-suivant"
          label="Suivant ▶"
          primary
          onPress={() => aller({ type: 'suivant' })}
          disabled={enSuite ? etat.suite === longueurSuite : etat.index >= dernier}
        />
      </View>
      <View style={[colonne, styles.barre]}>
        <Action
          testID="revue-erreur-suivante"
          label="Erreur suivante"
          onPress={() => aller({ type: 'erreurSuivante' })}
          disabled={suivante === null}
        />
        {enSuite ? (
          <Action testID="revue-retour" label="Retour à la partie" primary onPress={() => aller({ type: 'fermerSuite' })} />
        ) : (
          <Action
            testID="revue-suite"
            label="Voir la meilleure suite"
            onPress={() => aller({ type: 'ouvrirSuite' })}
            disabled={coup === null || longueurSuite === 0}
          />
        )}
      </View>

      {/* ---- résumé par catégorie ---- */}
      <View style={[colonne, styles.carte, { marginTop: 8 }]} testID="revue-resume">
        <View style={styles.ligneTableau}>
          <Text style={[styles.cellule, styles.celluleLibelle]} />
          <Text style={[styles.cellule, styles.enteteCol]} numberOfLines={1}>
            {noms.blancs}
          </Text>
          <Text style={[styles.cellule, styles.enteteCol]} numberOfLines={1}>
            {noms.noirs}
          </Text>
        </View>
        {CATEGORIES.map((cat) => (
          <View key={cat} style={styles.ligneTableau} testID={`revue-resume-${cat}`}>
            <View style={[styles.cellule, styles.celluleLibelle, styles.coupTitreLigne]}>
              <View style={[styles.pastille, { backgroundColor: COULEUR_VERDICT[cat] }]} />
              <Text style={styles.libelleCat} numberOfLines={1}>
                {NOM_CATEGORIE[cat]}
              </Text>
            </View>
            <Text style={[styles.cellule, styles.valeurCat]} testID={`revue-resume-${cat}-w`}>
              {revue.resume.w[cat]}
            </Text>
            <Text style={[styles.cellule, styles.valeurCat]} testID={`revue-resume-${cat}-b`}>
              {revue.resume.b[cat]}
            </Text>
          </View>
        ))}
      </View>

      {/* ---- liste des coups ---- */}
      <View style={[colonne, styles.liste]}>
        {revue.coups.map((c, i) => (
          <Pressable
            key={`${c.ply}-${c.san}`}
            testID={`revue-coup-${i}`}
            accessibilityRole="button"
            accessibilityLabel={`${c.san}, ${c.titre}`}
            onPress={() => aller({ type: 'aller', index: i })}
            style={[
              styles.puce,
              { borderLeftColor: COULEUR_VERDICT[c.verdict] },
              i === etat.index ? styles.puceActive : null,
            ]}
          >
            <Text style={styles.puceTexte}>
              {numeroter(positions[i] ?? avant)}
              {c.san}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ---- pied ---- */}
      <View style={[colonne, styles.barre, { marginTop: 6 }]}>
        {onRejouer ? (
          <Action testID="revue-rejouer" label="Rejouer" onPress={onRejouer} />
        ) : null}
        <Action testID="revue-fermer-bas" label="Fermer" primary onPress={onFermer} />
      </View>
    </ScrollView>
  );
}

/** « 12. Cf3 Cc6 13. d4 » : la variante, avec ses numéros, jusqu'au coup `fait` inclus. */
function ligneDeVariante(depart: Position, sans: readonly string[], fait: number): string {
  if (sans.length === 0) return '—';
  let n = depart.fullmove;
  let blancs = depart.turn === 'w';
  const morceaux: string[] = [];
  sans.forEach((san, i) => {
    if (blancs) morceaux.push(`${n}. ${san}`);
    else morceaux.push(i === 0 ? `${n}… ${san}` : san);
    if (!blancs) n += 1;
    blancs = !blancs;
    // le coup en cours est encadré, pour suivre la variante du regard
    if (i + 1 === fait) morceaux[morceaux.length - 1] = `[${morceaux[morceaux.length - 1]}]`;
  });
  return morceaux.join(' ');
}

const styles = StyleSheet.create({
  racine: { flex: 1, backgroundColor: C.app },
  contenu: { paddingVertical: 12, alignItems: 'center' },
  entete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titrePage: { color: C.text, fontSize: 18, fontWeight: '800', flexShrink: 1 },
  fermer: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10, backgroundColor: C.surface },
  fermerTexte: { color: C.muted, fontSize: 13, fontWeight: '800' },
  precisions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  precision: { flex: 1, backgroundColor: C.surface, borderRadius: 12, padding: 10, alignItems: 'center' },
  precisionNom: { color: C.muted, fontSize: 12, fontWeight: '800' },
  precisionValeur: { color: C.text, fontSize: 24, fontWeight: '800' },
  precisionLibelle: { color: C.muted2, fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  moteur: { color: C.muted2, fontSize: 11, textAlign: 'center' },
  legende: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 12, gap: 8 },
  legendeTexte: { color: C.muted, fontSize: 12, fontWeight: '700', flexShrink: 1 },
  evaluation: { color: C.text, fontSize: 14, fontWeight: '800' },
  carte: { backgroundColor: C.surface, borderRadius: 14, padding: 12, marginTop: 10 },
  coupTitreLigne: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pastille: { width: 10, height: 10, borderRadius: 5 },
  coupTitre: { color: C.text, fontSize: 15, fontWeight: '800', flexShrink: 1 },
  texte: { color: C.muted, fontSize: 13, lineHeight: 18, marginTop: 6 },
  barre: { flexDirection: 'row', gap: 6, marginTop: 8 },
  ligneTableau: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  cellule: { flex: 1 },
  celluleLibelle: { flex: 2 },
  enteteCol: { color: C.muted, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  libelleCat: { color: C.text, fontSize: 13, fontWeight: '700', flexShrink: 1 },
  valeurCat: { color: C.text, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  liste: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 10 },
  puce: {
    backgroundColor: C.surface,
    borderRadius: 8,
    borderLeftWidth: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  puceActive: { backgroundColor: C.surface2, borderColor: C.green, borderWidth: 1 },
  puceTexte: { color: C.text, fontSize: 12, fontWeight: '700' },
});
