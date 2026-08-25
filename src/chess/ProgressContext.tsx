import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
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
  update: () => [],
  setSettings: () => {},
  reset: () => {},
  celebrating: null,
  dismissCelebration: () => {},
});

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<Progress>(emptyProgress);
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    loadProgress().then((saved) => {
      if (!alive) return;
      setProgress(saved);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const update = useCallback((fn: (p: Progress) => Awarded): string[] => {
    let unlocked: string[] = [];
    setProgress((current) => {
      const result = fn(current);
      unlocked = result.unlocked;
      void saveProgress(result.progress);
      return result.progress;
    });
    if (unlocked.length > 0) setQueue((q) => [...q, ...unlocked]);
    return unlocked;
  }, []);

  const setSettings = useCallback((patch: Partial<Settings>) => {
    setProgress((current) => {
      const next = { ...current, settings: { ...current.settings, ...patch } };
      void saveProgress(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    void resetProgress().then(setProgress);
    setQueue([]);
  }, []);

  const dismissCelebration = useCallback(() => setQueue((q) => q.slice(1)), []);

  const celebrating = useMemo(
    () => TROPHIES.find((t) => t.id === queue[0]) ?? null,
    [queue],
  );

  const value = useMemo(
    () => ({ progress, loading, update, setSettings, reset, celebrating, dismissCelebration }),
    [progress, loading, update, setSettings, reset, celebrating, dismissCelebration],
  );

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress(): ProgressContextValue {
  return useContext(ProgressContext);
}
