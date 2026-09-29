import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { TROPHIES } from './content';
import {
  type Awarded,
  type Progress,
  type Settings,
  emptyProgress,
  loadProgress,
  resetProgress,
  saveProgress,
} from './progress';

interface ProgressContextValue {
  progress: Progress;
  /** Vrai tant que la sauvegarde n'a pas été relue au démarrage. */
  loading: boolean;
  /**
   * Message à afficher quand la progression ne peut pas être sauvegardée
   * (stockage plein, navigation privée), ou `null`. Sans lui, l'élève joue
   * des heures en croyant ses points en sécurité.
   */
  avertissement: string | null;
  /** Applique une mise à jour et sauvegarde ; renvoie les trophées débloqués. */
  update: (fn: (p: Progress) => Awarded) => string[];
  setSettings: (patch: Partial<Settings>) => void;
  reset: () => void;
  /** Trophée à célébrer, ou null. */
  celebrating: (typeof TROPHIES)[number] | null;
  dismissCelebration: () => void;
}

const ProgressContext = createContext<ProgressContextValue>({
  progress: emptyProgress(),
  loading: true,
  avertissement: null,
  update: () => [],
  setSettings: () => {},
  reset: () => {},
  celebrating: null,
  dismissCelebration: () => {},
});

const MESSAGE_STOCKAGE =
  'Ta progression ne peut pas être sauvegardée sur cet appareil (navigation privée ou stockage plein).';

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<Progress>(emptyProgress);
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState<string[]>([]);
  const [avertissement, setAvertissement] = useState<string | null>(null);

  /**
   * La vérité vit dans une référence, pas dans l'état React.
   *
   * `update` calculait autrefois les trophées débloqués **dans** la fonction
   * passée à `setProgress`, puis les lisait juste après. Or React n'exécute
   * cette fonction tout de suite que pour la première mise à jour : dès la
   * suivante, elle est différée, la variable restait vide et `update` rendait
   * toujours `[]`. Les trophées étaient bien sauvegardés, mais la fenêtre
   * « Trophée débloqué ! » n'apparaissait presque jamais. Une référence se lit
   * et s'écrit sur-le-champ, et garde `update` valable même appelé deux fois
   * de suite avant que React ait rendu.
   */
  const courant = useRef<Progress>(emptyProgress());
  // `loading` est un état : sa valeur au moment où `update` est créé serait
  // figée dans la fermeture. Une référence dit toujours la vérité.
  const relu = useRef(false);
  /** Vrai si l'on peut écrire : faux tant que la lecture a échoué. */
  const ecriture = useRef(true);

  useEffect(() => {
    let alive = true;
    loadProgress().then(({ progress: saved, fiable }) => {
      if (!alive) return;
      relu.current = true;
      ecriture.current = fiable;
      courant.current = saved;
      setProgress(saved);
      if (!fiable) setAvertissement(MESSAGE_STOCKAGE);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const enregistrer = useCallback((p: Progress) => {
    // Après un échec de lecture, l'état en mémoire est vide : l'écrire
    // remplacerait la vraie progression pour une panne peut-être passagère.
    if (!ecriture.current) return;
    void saveProgress(p).then((ok) => setAvertissement(ok ? null : MESSAGE_STOCKAGE));
  }, []);

  const update = useCallback(
    (fn: (p: Progress) => Awarded): string[] => {
      // Tant que la sauvegarde n'a pas été relue, l'état en mémoire est vide.
      // Écrire maintenant remplacerait la progression de l'élève par ce vide.
      if (!relu.current) return [];
      const result = fn(courant.current);
      courant.current = result.progress;
      setProgress(result.progress);
      enregistrer(result.progress);
      if (result.unlocked.length > 0) setQueue((q) => [...q, ...result.unlocked]);
      return result.unlocked;
    },
    [enregistrer],
  );

  const setSettings = useCallback(
    (patch: Partial<Settings>) => {
      if (!relu.current) return;
      const next = { ...courant.current, settings: { ...courant.current.settings, ...patch } };
      courant.current = next;
      setProgress(next);
      enregistrer(next);
    },
    [enregistrer],
  );

  const reset = useCallback(() => {
    courant.current = emptyProgress();
    setProgress(courant.current);
    ecriture.current = true;
    setQueue([]);
    void resetProgress().then((vide) => {
      courant.current = vide;
      setProgress(vide);
    });
  }, []);

  const dismissCelebration = useCallback(() => setQueue((q) => q.slice(1)), []);

  const celebrating = useMemo(
    () => TROPHIES.find((t) => t.id === queue[0]) ?? null,
    [queue],
  );

  const value = useMemo(
    () => ({
      progress,
      loading,
      avertissement,
      update,
      setSettings,
      reset,
      celebrating,
      dismissCelebration,
    }),
    [progress, loading, avertissement, update, setSettings, reset, celebrating, dismissCelebration],
  );

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress(): ProgressContextValue {
  return useContext(ProgressContext);
}
