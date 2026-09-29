import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BandeauJoueur } from '../src/components/BandeauJoueur';
import { ChessBoard, type Arrow, type SquareBadge } from '../src/components/ChessBoard';
import { CoachBubble, type BubbleTone } from '../src/components/CoachBubble';
import { PromotionDialog } from '../src/components/PromotionDialog';
import { Action, ActionBar, Button, Chips, Dialog, ListItem } from '../src/components/UI';
import { C, S } from '../src/components/theme';
import { useProgress } from '../src/chess/ProgressContext';
import { BOTS, STOCKFISH_NIVEAUX, type Bot } from '../src/chess/content';
import { enregistrerActivite, finishGame } from '../src/chess/progress';
import { hangingSquare, updateElo } from '../src/chess/ai';
import { createEngine } from '../src/analysis';
import { analyserPartie, RevueAnnulee, type RevueComplete } from '../src/analysis/review';
import { RevueDePartie } from '../src/components/RevueDePartie';
import { perteEnPions, type Verdict } from '../src/chess/coaching';
import { Cerveau } from '../src/chess/brain/cerveau';
import { coupAdverse, type Moteurs } from '../src/chess/adversaire';
import { REFLEXION_MIN_MS, TRACE_MS, toucherCase } from '../src/chess/interaction';
import { bilanMateriel, peutMater } from '../src/chess/materiel';
import { nommerOuverture } from '../src/chess/ouvertures';
import {
  abandonner,
  annuler,
  auBot,
  avecIndice,
  depuisSauvegarde,
  estClassee,
  jouer,
  marquerScoree,
  nouvellePartie,
  perdreAuTemps,
  versSauvegarde,
  type Partie,
  type Sauvegarde,
} from '../src/chess/partie';
import { versPGN } from '../src/chess/pgn';
import {
  CADENCES,
  coupJoue,
  creer as creerPendule,
  drapeauTombe,
  formater,
  lire as lirePendule,
  reprendre as reprendrePendule,
} from '../src/chess/pendule';
import { partager } from '../src/partage';
import { jouerSon, type Effet } from '../src/son';
import {
  START_FEN,
  inCheck,
  findKing,
  legalMoves,
  movesFrom,
  parseFEN,
  squareName,
  toFEN,
  type Color,
  type Move,
  type Piece,
  type Position,
} from '../src/chess/engine';

/** Clé de la partie en cours, distincte de la progression pour ne jamais s'y mêler. */
const CLE_PARTIE = 'lotus-chess:partie:v1';

type Couleur = 'w' | 'b' | 'hasard';

const VERDICT_COULEUR: Record<Verdict, string> = {
  brillant: C.gold,
  bon: C.green,
  imprecision: C.blue,
  erreur: '#d2723a',
  gaffe: C.red,
};

/** Le son qui convient au coup qu'on vient de jouer. */
function effetPour(coup: Move, apres: Position, fini: boolean): Effet {
  if (fini) return 'fin';
  if (coup.castle) return 'roque';
  if (inCheck(apres, apres.turn)) return 'echec';
  if (coup.promotion) return 'promotion';
  if (coup.captured || coup.enPassant) return 'prise';
  return 'coup';
}

const attendre = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export default function PlayScreen() {
  const { width } = useWindowDimensions();
  const { progress, update } = useProgress();
  const reglages = progress.settings;
  const eloRef = useRef(progress.elo);
  eloRef.current = progress.elo;

  /**
   * La partie vit dans une référence **et** dans l'état.
   *
   * La référence dit toujours la vérité, même entre deux rendus ; l'état sert à
   * redessiner. Toutes les transitions se calculent hors des fonctions passées
   * à `setState` : l'ancienne version y cachait la mise à jour du classement,
   * que React peut rejouer ou différer — de quoi la compter deux fois ou pas
   * du tout.
   */
  const [partie, setPartieEtat] = useState<Partie | null>(null);
  const partieRef = useRef<Partie | null>(null);
  const commit = useCallback((p: Partie | null) => {
    partieRef.current = p;
    setPartieEtat(p);
  }, []);

  // ---- préparation
  const [couleur, setCouleur] = useState<Couleur>('w');
  const [cadence, setCadence] = useState('libre');
  const [sauvee, setSauvee] = useState<Sauvegarde | null>(null);

  // ---- interface de la partie en cours
  const [selected, setSelected] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [ton, setTon] = useState<BubbleTone>('neutral');
  const [aideEchec, setAideEchec] = useState(false);
  const [vue, setVue] = useState<number | null>(null);
  const [retourne, setRetourne] = useState(false);
  const [promo, setPromo] = useState<Move[] | null>(null);
  const [dialogue, setDialogue] = useState<'abandon' | 'quitter' | 'options' | null>(null);
  const [finTexte, setFinTexte] = useState<string | null>(null);
  const [trace, setTrace] = useState<{ from: number; to: number; piece: Piece } | null>(null);
  const [indice, setIndice] = useState<{ niveau: 1 | 2; de: number; vers: number } | null>(null);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const [notice, setNotice] = useState<string | null>(null);

  // ---- analyse de fin de partie
  const [review, setReview] = useState<RevueComplete | null>(null);
  const revueFermee = useRef(false);
  const [analysing, setAnalysing] = useState<string | null>(null);

  // un seul moteur d'analyse pour tout l'écran : le démarrer coûte le chargement du wasm
  const analyse_ = useRef<ReturnType<typeof createEngine> | null>(null);
  const cerveau = useRef<Cerveau | null>(null);
  const traceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const moteurs = useCallback((): Moteurs => {
    if (!analyse_.current) analyse_.current = createEngine();
    if (!cerveau.current) cerveau.current = new Cerveau();
    return { analyse: analyse_.current, cerveau: cerveau.current };
  }, []);

  // sur mobile natif, la page ne doit pas défiler pendant qu'on glisse une pièce
  const [glisse, setGlisse] = useState(false);
  const boardSize = Math.min(width - 8, 460);

  useEffect(
    () => () => {
      if (traceTimer.current) clearTimeout(traceTimer.current);
      revueFermee.current = true;
      // le worker Stockfish survivrait au démontage de l'écran
      analyse_.current?.dispose();
      analyse_.current = null;
    },
    [],
  );

  // ------------------------------------------------------------- persistance

  // Relit une partie interrompue : fermer l'onglet, iOS qui purge la page ou
  // un rechargement ne doivent pas coûter la partie.
  useEffect(() => {
    let vivant = true;
    AsyncStorage.getItem(CLE_PARTIE)
      .then((brut) => {
        if (!vivant || !brut) return;
        try {
          const data = JSON.parse(brut);
          // une sauvegarde illisible est ignorée : mieux vaut perdre une partie qu'en afficher une fausse
          if (depuisSauvegarde(data, BOTS)) setSauvee(data as Sauvegarde);
          else void AsyncStorage.removeItem(CLE_PARTIE);
        } catch {
          void AsyncStorage.removeItem(CLE_PARTIE);
        }
      })
      .catch(() => undefined);
    return () => {
      vivant = false;
    };
  }, []);

  useEffect(() => {
    if (!partie) return;
    if (partie.fin) {
      void AsyncStorage.removeItem(CLE_PARTIE).catch(() => undefined);
    } else {
      void AsyncStorage.setItem(CLE_PARTIE, JSON.stringify(versSauvegarde(partie))).catch(
        () => undefined,
      );
    }
  }, [partie]);

  // --------------------------------------------------------------- fin de partie

  /**
   * Compte la partie, une seule fois.
   *
   * Le classement ne bouge que si la partie est classée : ni coup repris, ni
   * indice. Sans cette règle, reprendre chaque gaffe revenait à ne jamais
   * perdre — et « Annuler » après le mat permettait de recompter la même
   * victoire à l'infini.
   */
  const conclure = useCallback(
    (p: Partie) => {
      if (!p.fin || p.scoree) return;
      let texte = p.fin.message;
      if (estClassee(p)) {
        const score = p.fin.resultat === 'win' ? 1 : p.fin.resultat === 'draw' ? 0.5 : 0;
        const nouveau = updateElo(eloRef.current, p.bot.elo, score);
        const delta = nouveau - eloRef.current;
        update((pr) => finishGame(pr, p.bot.nom, p.fin!.resultat, updateElo(pr.elo, p.bot.elo, score)));
        texte += `\nClassement : ${nouveau} (${delta >= 0 ? '+' : ''}${delta})`;
      } else {
        texte +=
          '\nPartie d’entraînement (coup repris ou indice utilisé) : ton classement ne change pas.';
        // elle ne touche pas au classement, mais c'est bien une partie jouée : elle compte pour l'objectif du jour
        update((pr) => enregistrerActivite(pr, 'partie'));
      }
      commit(marquerScoree(p));
      setFinTexte(texte);
      setTon(p.fin.resultat === 'win' ? 'ok' : p.fin.resultat === 'draw' ? 'neutral' : 'bad');
      setMessage(p.fin.message);
      setSelected(null);
      setIndice(null);
      jouerSon('fin', reglages);
    },
    [commit, reglages, update],
  );

  // ------------------------------------------------------------------ coups

  const effacerTrace = useCallback(() => {
    if (traceTimer.current) clearTimeout(traceTimer.current);
    setTrace(null);
  }, []);

  /** Applique un coup, de l'élève ou de l'ordinateur, à la partie courante. */
  const appliquer = useCallback(
    (coup: Move, parBot: boolean) => {
      const p = partieRef.current;
      if (!p || p.fin) return;
      const joueur: Color = p.position.turn;
      const piece = p.position.board[coup.from];
      let suivante = jouer(p, coup);
      if (suivante.pendule) {
        suivante = { ...suivante, pendule: coupJoue(suivante.pendule, joueur, Date.now()) };
      }
      commit(suivante);
      setVue(null);
      setSelected(null);
      setIndice(null);
      setAideEchec(false);
      setPromo(null);

      if (parBot) {
        // le fantôme reste sur la case de départ le temps de lire le coup
        if (piece) {
          setTrace({ from: coup.from, to: coup.to, piece });
          if (traceTimer.current) clearTimeout(traceTimer.current);
          traceTimer.current = setTimeout(() => setTrace(null), TRACE_MS);
        }
        setTon('neutral');
        setMessage(`${p.bot.nom} a joué ${suivante.sans[suivante.sans.length - 1]}.`);
      } else {
        effacerTrace();
        // le coach avertit quand le coup laisse une pièce en prise
        const enPrise = hangingSquare(suivante.position);
        if (enPrise >= 0 && !suivante.fin) {
          setTon('bad');
          setMessage(`Attention : ta pièce en ${squareName(enPrise).toUpperCase()} peut être capturée.`);
        } else {
          setTon('neutral');
          setMessage(coup.captured ? 'Bonne capture.' : '');
        }
      }
      if (suivante.fin) conclure(suivante);
      else jouerSon(effetPour(coup, suivante.position, false), reglages);
    },
    [commit, conclure, effacerTrace, reglages],
  );

  /** L'ordinateur joue dès que le trait lui revient. */
  useEffect(() => {
    if (!partie || !auBot(partie)) return undefined;
    const id = partie.id;
    const fen = toFEN(partie.position);
    const depart = Date.now();
    let vivant = true;

    const jouerBot = async () => {
      const p = partieRef.current;
      if (!p || p.id !== id) return;
      let coup: Move | null = null;
      try {
        coup = await coupAdverse(p, moteurs());
      } catch {
        coup = null;
      }
      if (!vivant || !coup) return;
      // Stockfish répond en quelques centaines de millisecondes, le cerveau en
      // quelques-unes : sans plancher la vitesse dépendrait de l'adversaire. Ce
      // délai n'est pas de l'attente perdue, c'est ce qui rend le coup lisible.
      const reste = REFLEXION_MIN_MS - (Date.now() - depart);
      if (reste > 0) await attendre(reste);
      if (!vivant) return;
      // la partie a pu changer pendant la réflexion (annulation, nouvelle partie,
      // abandon) : on ne joue un coup que dans la position pour laquelle il a été calculé
      const courante = partieRef.current;
      if (!courante || courante.id !== id || courante.fin || toFEN(courante.position) !== fen) return;
      appliquer(coup, true);
    };

    const minuteur = setTimeout(jouerBot, 120);
    return () => {
      vivant = false;
      clearTimeout(minuteur);
    };
    // la partie est relue dans la référence : seuls l'identité et la position relancent le bot
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partie?.id, partie?.position, partie?.fin]);

  // -------------------------------------------------------------- pendule

  const aPendule = Boolean(partie?.pendule);
  useEffect(() => {
    if (!aPendule || !partie || partie.fin) return undefined;
    const tic = setInterval(() => {
      const now = Date.now();
      setMaintenant(now);
      const p = partieRef.current;
      if (!p || p.fin || !p.pendule) return;
      const tombe = drapeauTombe(p.pendule, now);
      if (tombe) {
        const autre: Color = tombe === 'w' ? 'b' : 'w';
        const fini = perdreAuTemps(p, tombe, !peutMater(p.position, autre));
        commit(fini);
        conclure(fini);
      }
    }, 200);
    return () => clearInterval(tic);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partie?.id, aPendule, partie?.fin, commit, conclure]);

  // ---------------------------------------------------------------- actions

  const demarrer = useCallback(
    (bot: Bot) => {
      const camp: Color = couleur === 'hasard' ? (Math.random() < 0.5 ? 'w' : 'b') : couleur;
      const cad = CADENCES.find((c) => c.id === cadence) ?? CADENCES[0];
      cerveau.current?.nouvellePartie();
      const p = nouvellePartie(bot, camp, creerPendule(cad));
      commit(p);
      setSelected(null);
      setVue(null);
      setRetourne(false);
      setReview(null);
      setFinTexte(null);
      setIndice(null);
      setAideEchec(false);
      setPromo(null);
      setNotice(null);
      effacerTrace();
      setTon('neutral');
      setMessage(`${bot.nom} : « ${bot.say} »`);
    },
    [commit, couleur, cadence, effacerTrace],
  );

  const reprendre = useCallback(() => {
    if (!sauvee) return;
    const p = depuisSauvegarde(sauvee, BOTS);
    if (!p) {
      setSauvee(null);
      return;
    }
    const remise = p.pendule ? { ...p, pendule: reprendrePendule(p.pendule, Date.now()) } : p;
    commit(remise);
    setSauvee(null);
    setSelected(null);
    setVue(null);
    setReview(null);
    setFinTexte(null);
    setTon('neutral');
    setMessage(`Partie reprise contre ${p.bot.nom}.`);
  }, [commit, sauvee]);

  const onPressSquare = useCallback(
    (square: number) => {
      const p = partieRef.current;
      if (!p || p.fin || vue !== null || p.position.turn !== p.side) return;
      const decision = toucherCase(p.position, selected, square);
      if (decision.type === 'coup') {
        appliquer(decision.move, false);
      } else if (decision.type === 'promotion') {
        setPromo(decision.candidats);
      } else if (decision.type === 'refus') {
        setSelected(null);
        setAideEchec(true);
        setTon('bad');
        setMessage(decision.message);
        jouerSon('erreur', reglages);
      } else {
        setSelected(decision.square);
      }
    },
    [appliquer, reglages, selected, vue],
  );

  const annulerCoup = useCallback(() => {
    const p = partieRef.current;
    if (!p) return;
    const apres = annuler(p);
    if (apres === p) return;
    commit(apres);
    setSelected(null);
    setVue(null);
    setIndice(null);
    setAideEchec(false);
    effacerTrace();
    setTon('neutral');
    setMessage('Coup repris. Cette partie devient une partie d’entraînement : elle ne compte plus pour ton classement.');
  }, [commit, effacerTrace]);

  const confirmerAbandon = useCallback(() => {
    const p = partieRef.current;
    setDialogue(null);
    if (!p || p.fin) return;
    const fini = abandonner(p);
    commit(fini);
    conclure(fini);
  }, [commit, conclure]);

  /** Un indice : d'abord la pièce à jouer, puis le coup. Il retire la partie du classement. */
  const demanderIndice = useCallback(() => {
    const p = partieRef.current;
    if (!p || p.fin || p.position.turn !== p.side || vue !== null) return;
    if (indice && indice.niveau === 1) {
      setIndice({ ...indice, niveau: 2 });
      setMessage(`Indice : joue ${squareName(indice.de)} vers ${squareName(indice.vers)}.`);
      setTon('ok');
      return;
    }
    const a = moteurs().cerveau.analyser(p.position, { profondeur: 8, tempsMs: 500 });
    if (!a.meilleur) return;
    const de = a.meilleur.slice(0, 2);
    const vers = a.meilleur.slice(2, 4);
    const f = (n: string) => n.charCodeAt(0) - 97 + (Number(n[1]) - 1) * 8;
    if (p.indices === 0) commit(avecIndice(p));
    setSelected(null);
    setIndice({ niveau: 1, de: f(de), vers: f(vers) });
    setTon('ok');
    setMessage(
      `Indice : regarde ta pièce en ${de.toUpperCase()}. ${
        p.indices === 0 ? 'Cette partie ne comptera plus pour ton classement.' : ''
      }`.trim(),
    );
  }, [commit, indice, moteurs, vue]);

  const quitter = useCallback(() => {
    const p = partieRef.current;
    setDialogue(null);
    // une partie en cours reste sauvegardée : on pourra la reprendre
    if (p && !p.fin) setSauvee(versSauvegarde(p));
    commit(null);
    setReview(null);
    setFinTexte(null);
    effacerTrace();
  }, [commit, effacerTrace]);

  const copier = useCallback(async (quoi: 'pgn' | 'fen') => {
    const p = partieRef.current;
    setDialogue(null);
    if (!p) return;
    const blancs = p.side === 'w' ? 'Toi' : p.bot.nom;
    const noirs = p.side === 'w' ? p.bot.nom : 'Toi';
    const res = p.fin
      ? p.fin.resultat === 'draw'
        ? '1/2-1/2'
        : (p.fin.resultat === 'win') === (p.side === 'w')
          ? '1-0'
          : '0-1'
      : '*';
    const texte =
      quoi === 'pgn'
        ? versPGN(p.sans, {
            blancs,
            noirs,
            resultat: res,
            eloBlancs: p.side === 'w' ? eloRef.current : p.bot.elo,
            eloNoirs: p.side === 'w' ? p.bot.elo : eloRef.current,
            ouverture: nommerOuverture(p.moves.map((m) => `${squareName(m.from)}${squareName(m.to)}`)),
          })
        : toFEN(p.position);
    const issue = await partager(texte, quoi === 'pgn' ? 'Partie Lotus Chess' : 'Position Lotus Chess');
    setNotice(
      issue === 'copie'
        ? `${quoi === 'pgn' ? 'PGN' : 'FEN'} copié dans le presse-papiers.`
        : issue === 'partage'
          ? null
          : 'Impossible de copier ici : ton navigateur refuse le partage.',
    );
  }, []);

  // ------------------------------------------------------ analyse (revue)

  const analyse = useCallback(async () => {
    const p = partieRef.current;
    if (!p) return;
    if (!analyse_.current) analyse_.current = createEngine();
    setAnalysing('Analyse en cours…');
    try {
      revueFermee.current = false;
      const revue = await analyserPartie(analyse_.current, parseFEN(START_FEN), p.moves, p.sans, {
        depth: 10,
        joueur: p.side,
        onProgress: (fait, total) => setAnalysing(`Analyse ${fait}/${total}`),
        annule: () => revueFermee.current,
      });
      setReview(revue);
    } catch (e) {
      if (!(e instanceof RevueAnnulee)) setNotice('L’analyse a échoué. Réessaie dans un instant.');
    } finally {
      setAnalysing(null);
    }
  }, []);

  // --------------------------------------------------------------- dérivés

  /** Position avant chaque demi-coup, puis la position courante. */
  const positions = useMemo(
    () => (partie ? [...partie.history, partie.position] : []),
    [partie],
  );
  const positionAffichee = partie ? (vue === null ? partie.position : positions[vue]) : null;
  const coupAffiche: Move | null =
    partie && positionAffichee
      ? vue === null
        ? (partie.moves[partie.moves.length - 1] ?? null)
        : vue > 0
          ? (partie.moves[vue - 1] ?? null)
          : null
      : null;

  const botPense = Boolean(partie && auBot(partie) && vue === null);

  const badges = useMemo((): Record<number, SquareBadge> => {
    if (!partie || !positionAffichee) return {};
    const out: Record<number, SquareBadge> = {};
    if (partie.fin && vue === null && partie.fin.statut === 'mate') {
      out[findKing(partie.position, partie.position.turn)] = 'bad';
    }
    if (aideEchec && !partie.fin && vue === null) {
      legalMoves(partie.position).forEach((m) => {
        out[m.from] = 'good';
      });
    }
    if (indice && vue === null) out[indice.de] = 'good';
    return out;
  }, [partie, positionAffichee, vue, aideEchec, indice]);

  const ouverture = useMemo(
    () =>
      partie
        ? nommerOuverture(partie.moves.map((m) => `${squareName(m.from)}${squareName(m.to)}`))
        : null,
    [partie],
  );

  const fleches = useMemo((): Arrow[] => {
    const out: Arrow[] = [];
    if (trace && vue === null) out.push([squareName(trace.from), squareName(trace.to), C.blue]);
    if (indice && indice.niveau === 2 && vue === null) {
      out.push([squareName(indice.de), squareName(indice.vers), C.green]);
    }
    return out;
  }, [trace, indice, vue]);

  // ================================================================ rendu

  // ---- préparation : adversaires et options
  if (!partie) {
    return (
      <ScrollView style={S.screen} contentContainerStyle={{ paddingBottom: 28 }}>
        <CoachBubble
          coach="robi"
          text="Choisis ton adversaire. Commence par Pixou si tu débutes — il joue comme un débutant, pas au hasard."
        />

        {sauvee ? (
          <View style={[S.pad, { paddingTop: 12 }]}>
            <View style={[S.card, { gap: 10 }]}>
              <Text style={S.itemTitle}>Partie en cours</Text>
              <Text style={S.itemSub}>
                Contre {BOTS.find((b) => b.id === sauvee.botId)?.nom ?? 'un adversaire'} ·{' '}
                {Math.ceil(sauvee.moves.length / 2)} coups joués
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button label="Reprendre" onPress={reprendre} style={{ flex: 1 }} />
                <Button
                  label="Supprimer"
                  variant="neutral"
                  onPress={() => {
                    void AsyncStorage.removeItem(CLE_PARTIE).catch(() => undefined);
                    setSauvee(null);
                  }}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          </View>
        ) : null}

        <View style={S.sectionRow}>
          <Text style={S.sectionTitle}>Options</Text>
          <Text style={S.sectionMeta}>Ton classement : {progress.elo}</Text>
        </View>
        <View style={[S.pad, { gap: 10 }]}>
          <Text style={S.itemSub}>Tu joues</Text>
          <Chips<Couleur>
            testID="couleur"
            valeur={couleur}
            onChange={setCouleur}
            options={[
              { valeur: 'w', libelle: 'Les blancs' },
              { valeur: 'b', libelle: 'Les noirs' },
              { valeur: 'hasard', libelle: 'Au hasard' },
            ]}
          />
          <Text style={[S.itemSub, { marginTop: 4 }]}>Cadence</Text>
          <Chips
            testID="cadence"
            valeur={cadence}
            onChange={setCadence}
            options={CADENCES.map((c) => ({ valeur: c.id, libelle: c.nom }))}
          />
        </View>

        <View style={S.sectionRow}>
          <Text style={S.sectionTitle}>Adversaires</Text>
          <Text style={S.sectionMeta}>appuie pour commencer</Text>
        </View>
        <View style={[S.pad, { gap: 8 }]}>
          {BOTS.filter((b) => !b.stockfish).map((bot) => (
            <ListItem
              key={bot.id}
              title={`${bot.nom} · ${bot.elo}`}
              subtitle={bot.say}
              onPress={() => demarrer(bot)}
            />
          ))}
        </View>

        {/* Stockfish n'est pas un personnage de plus mais un moteur réglable :
            chaque niveau démarre une partie avec la même identité et un Elo
            différent. Il ne descend pas sous 1320 — d'où l'intérêt conservé
            des personnages pour débuter. */}
        {BOTS.filter((b) => b.stockfish).map((bot) => (
          <View key={bot.id}>
            <View style={S.sectionRow}>
              <Text style={S.sectionTitle}>{bot.nom}</Text>
              <Text style={S.sectionMeta}>{bot.say}</Text>
            </View>
            <View style={[S.pad, { gap: 8 }]}>
              {STOCKFISH_NIVEAUX.map((niveau) => (
                <ListItem
                  key={niveau.elo}
                  title={`${niveau.nom} · ${niveau.elo}`}
                  subtitle={`Stockfish bridé à ${niveau.elo} Elo`}
                  onPress={() => demarrer({ ...bot, elo: niveau.elo })}
                />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    );
  }

  const bot = partie.bot;

  // ---- revue de la partie
  if (review) {
    return (
      <RevueDePartie
        revue={review}
        positions={positions}
        joueur={partie.side}
        taille={boardSize}
        theme={reglages.board}
        coords={reglages.coords}
        noms={{
          blancs: partie.side === 'w' ? 'Blancs' : `${bot.nom} (blancs)`,
          noirs: partie.side === 'b' ? 'Noirs' : `${bot.nom} (noirs)`,
        }}
        indexInitial={Math.max(0, review.critique ?? 0)}
        onFermer={() => setReview(null)}
      />
    );
  }

  // ---- partie en cours
  const flipped = (partie.side === 'b') !== retourne;
  const bas: Color = flipped ? 'b' : 'w';
  const haut: Color = bas === 'w' ? 'b' : 'w';
  const bilan = bilanMateriel(positionAffichee ?? partie.position);
  const lecture = partie.pendule ? lirePendule(partie.pendule, maintenant) : null;
  const bandeau = (camp: Color, testID: string) => {
    const moi = camp === partie.side;
    const idx = camp === 'w' ? 0 : 1;
    const avantage = camp === 'w' ? Math.max(0, bilan.ecart) : Math.max(0, -bilan.ecart);
    const restant = lecture ? lecture[idx] : undefined;
    return (
      <BandeauJoueur
        testID={testID}
        nom={moi ? 'Toi' : bot.nom}
        elo={moi ? progress.elo : bot.elo}
        prises={camp === 'w' ? bilan.prisesParBlanc : bilan.prisesParNoir}
        avantage={avantage}
        temps={restant !== undefined ? formater(restant) : undefined}
        actif={Boolean(partie.pendule && !partie.fin && partie.pendule.actif === camp)}
        urgent={restant !== undefined && restant < 20_000}
      />
    );
  };

  const nbCoups = partie.moves.length;
  const jouable = partie.fin === null && vue === null;

  return (
    <View style={S.screen}>
      <ScrollView scrollEnabled={!glisse} contentContainerStyle={{ paddingBottom: 8 }}>
        <CoachBubble
          coach="robi"
          text={botPense ? `${bot.nom} réfléchit…` : (notice ?? message)}
          tone={botPense ? 'neutral' : notice ? 'neutral' : ton}
        />
        <View style={styles.boardWrap}>
          <View style={{ width: boardSize }}>
            {bandeau(haut, 'bandeau-haut')}
            <ChessBoard
              onGlisser={setGlisse}
              position={positionAffichee ?? partie.position}
              size={boardSize}
              theme={reglages.board}
              showCoords={reglages.coords}
              flipped={flipped}
              selected={vue === null ? selected : null}
              targets={vue === null && selected !== null ? movesFrom(partie.position, selected) : []}
              lastMove={coupAffiche}
              ghost={trace && vue === null ? { square: trace.from, piece: trace.piece } : null}
              arrows={fleches}
              badges={badges}
              onPressSquare={onPressSquare}
            />
            {bandeau(bas, 'bandeau-bas')}
          </View>
        </View>

        <View style={styles.nav}>
          {(
            [
              ['⏮', 'debut', () => setVue(0), nbCoups === 0 || vue === 0],
              [
                '◀',
                'precedent',
                () => setVue((v) => Math.max(0, (v ?? nbCoups) - 1)),
                nbCoups === 0 || vue === 0,
              ],
              [
                '▶',
                'suivant',
                () => setVue((v) => (v === null || v + 1 >= nbCoups ? null : v + 1)),
                vue === null,
              ],
              ['⏭', 'fin', () => setVue(null), vue === null],
            ] as const
          ).map(([glyphe, id, action, off]) => (
            <Pressable
              key={id}
              testID={`nav-${id}`}
              accessibilityRole="button"
              accessibilityLabel={id}
              disabled={off}
              onPress={action}
              style={[styles.navBouton, off ? { opacity: 0.35 } : null]}
            >
              <Text style={styles.navGlyphe}>{glyphe}</Text>
            </Pressable>
          ))}
        </View>

        <View style={S.sectionRow}>
          <Text style={S.sectionTitle}>{ouverture ?? 'Coups'}</Text>
          <Text style={S.sectionMeta}>
            {bot.nom} · {bot.elo}
            {estClassee(partie) ? '' : ' · entraînement'}
          </Text>
        </View>
        <View style={[S.pad, styles.moveList]}>
          {partie.sans.length === 0 ? (
            <Text style={S.muted}>
              {partie.side === 'w' ? 'À toi de jouer.' : `${bot.nom} ouvre la partie.`}
            </Text>
          ) : (
            partie.sans.map((san, i) => {
              const actif = (vue ?? nbCoups) === i + 1;
              return (
                <Pressable
                  key={`${san}-${i}`}
                  testID={`coup-${i}`}
                  onPress={() => setVue(i + 1 >= nbCoups ? null : i + 1)}
                  style={[styles.coup, actif ? styles.coupActif : null]}
                >
                  <Text style={[styles.move, actif ? { color: C.text } : null]}>
                    {i % 2 === 0 ? `${i / 2 + 1}. ` : ''}
                    {san}
                  </Text>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>

      {partie.fin ? (
        <ActionBar>
          <Action
            label={analysing ?? 'Analyser'}
            primary
            testID="action-analyser"
            disabled={analysing !== null}
            onPress={analyse}
          />
          <Action
            label="Rejouer"
            testID="action-rejouer"
            onPress={() => demarrer(bot)}
            disabled={analysing !== null}
          />
          <Action label="Partager" testID="action-partager" onPress={() => setDialogue('options')} />
          <Action label="Quitter" testID="action-quitter" onPress={quitter} disabled={analysing !== null} />
        </ActionBar>
      ) : (
        <ActionBar>
          <Action
            label="Annuler"
            testID="action-annuler"
            onPress={annulerCoup}
            disabled={!jouable || partie.history.length === 0}
          />
          <Action label="Indice" testID="action-indice" onPress={demanderIndice} disabled={!jouable || botPense} />
          <Action label="Abandonner" testID="action-abandonner" onPress={() => setDialogue('abandon')} />
          <Action label="⋯" testID="action-options" onPress={() => setDialogue('options')} />
        </ActionBar>
      )}

      <PromotionDialog
        candidats={promo}
        blanc={partie.side === 'w'}
        onChoisir={(m) => appliquer(m, false)}
        onAnnuler={() => setPromo(null)}
      />

      <Dialog
        visible={dialogue === 'abandon'}
        title="Abandonner la partie ?"
        message={
          estClassee(partie)
            ? `Tu perdras des points de classement contre ${bot.nom}.`
            : 'Cette partie est un entraînement : ton classement ne changera pas.'
        }
        onClose={() => setDialogue(null)}
      >
        <View style={{ gap: 8 }}>
          <Button label="Abandonner" variant="danger" onPress={confirmerAbandon} />
          <Button label="Continuer à jouer" variant="neutral" onPress={() => setDialogue(null)} />
        </View>
      </Dialog>

      <Dialog visible={dialogue === 'quitter'} title="Quitter la partie ?" onClose={() => setDialogue(null)}>
        <View style={{ gap: 8 }}>
          <Button label="Quitter (je pourrai reprendre)" onPress={quitter} />
          <Button label="Continuer à jouer" variant="neutral" onPress={() => setDialogue(null)} />
        </View>
      </Dialog>

      <Dialog visible={dialogue === 'options'} title="Options" onClose={() => setDialogue(null)}>
        <View style={{ gap: 8 }}>
          <Button
            label="Retourner l’échiquier"
            variant="neutral"
            onPress={() => {
              setRetourne((r) => !r);
              setDialogue(null);
            }}
          />
          <Button label="Copier le PGN" variant="neutral" onPress={() => copier('pgn')} />
          <Button label="Copier le FEN" variant="neutral" onPress={() => copier('fen')} />
          {!partie.fin ? (
            <Button
              label="Quitter (reprendre plus tard)"
              variant="neutral"
              onPress={() => setDialogue('quitter')}
            />
          ) : null}
          <Button label="Fermer" onPress={() => setDialogue(null)} />
        </View>
      </Dialog>

      <Dialog
        visible={finTexte !== null && review === null}
        title="Partie terminée"
        message={finTexte ?? undefined}
        onClose={() => setFinTexte(null)}
      >
        <View style={{ gap: 8 }}>
          <Button
            label="Analyser la partie"
            onPress={() => {
              setFinTexte(null);
              analyse();
            }}
          />
          <Button
            label="Rejouer"
            variant="neutral"
            onPress={() => {
              setFinTexte(null);
              demarrer(bot);
            }}
          />
          <Button label="Voir l’échiquier" variant="neutral" onPress={() => setFinTexte(null)} />
        </View>
      </Dialog>
    </View>
  );
}

/** Écart affiché à côté du verdict, muet quand il ne veut rien dire. */
function ecart(perte: number): string {
  const pions = perteEnPions(perte);
  // au-delà du seuil c'est un mat qui se joue : « −989,4 » n'aurait aucun sens
  if (pions === null) return ' · mat en jeu';
  return pions > 0.3 ? ` · −${pions.toFixed(1).replace('.', ',')}` : '';
}

const styles = StyleSheet.create({
  boardWrap: { alignItems: 'center', paddingTop: 4 },
  nav: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingTop: 6 },
  navBouton: {
    minWidth: 56,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: C.surface,
  },
  navGlyphe: { color: C.text, fontSize: 16, fontWeight: '800' },
  moveList: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  coup: { paddingVertical: 4, paddingHorizontal: 6, borderRadius: 6 },
  coupActif: { backgroundColor: C.surface2 },
  move: { color: C.muted, fontSize: 13, fontWeight: '700' },
  tag: { width: 10, height: 22, borderRadius: 4 },
});
