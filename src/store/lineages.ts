import { create } from 'zustand';
import type { Lineage, LineageWithArtifact, LineageLabel } from '../types';
import * as queries from '../db/queries';

interface LineageState {
  lineages: LineageWithArtifact[];
  isLoading: boolean;
  isRegenerating: boolean;
  error: string | null;

  // Actions
  loadLineages: (sessionId: string) => void;
  createInitialLineages: (sessionId: string, strategies: { label: LineageLabel; strategyTag: string; content: string }[]) => void;
  toggleLock: (lineageId: string) => void;
  setScore: (lineageId: string, score: number) => void;
  setComment: (lineageId: string, comment: string) => void;
  setDirective: (lineageId: string, type: 'sticky' | 'oneshot', content: string) => void;
  clearDirective: (lineageId: string, type: 'sticky' | 'oneshot') => void;
  regenerateUnlocked: (sessionId: string, generateArtifact: (lineage: Lineage, cycle: number) => Promise<string>) => Promise<void>;
  canRegenerate: () => boolean;
  getUnlockedLineages: () => LineageWithArtifact[];
}

export const useLineageStore = create<LineageState>((set, get) => ({
  lineages: [],
  isLoading: false,
  isRegenerating: false,
  error: null,

  loadLineages: (sessionId: string) => {
    try {
      set({ isLoading: true });
      const lineages = queries.getLineagesBySession(sessionId);
      const lineagesWithArtifacts: LineageWithArtifact[] = lineages.map((lineage) => {
        const artifact = queries.getLatestArtifact(lineage.id);
        const evaluation = artifact ? queries.getEvaluationForArtifact(artifact.id) : null;
        return {
          ...lineage,
          currentArtifact: artifact,
          currentEvaluation: evaluation,
          cycle: artifact?.cycle ?? 0,
        };
      });
      set({ lineages: lineagesWithArtifacts, isLoading: false, error: null });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  createInitialLineages: (sessionId, strategies) => {
    const lineagesWithArtifacts: LineageWithArtifact[] = strategies.map((strategy) => {
      const lineage = queries.createLineage(sessionId, strategy.label, strategy.strategyTag);
      const artifact = queries.createArtifact(lineage.id, 1, strategy.content);
      return {
        ...lineage,
        currentArtifact: artifact,
        currentEvaluation: null,
        cycle: 1,
      };
    });
    set({ lineages: lineagesWithArtifacts });
  },

  toggleLock: (lineageId: string) => {
    const lineage = get().lineages.find((l) => l.id === lineageId);
    if (!lineage) return;

    queries.updateLineage(lineageId, { isLocked: !lineage.isLocked });
    set((state) => ({
      lineages: state.lineages.map((l) =>
        l.id === lineageId ? { ...l, isLocked: !l.isLocked } : l
      ),
    }));
  },

  setScore: (lineageId: string, score: number) => {
    const lineage = get().lineages.find((l) => l.id === lineageId);
    if (!lineage?.currentArtifact) return;

    if (lineage.currentEvaluation) {
      queries.updateEvaluation(lineage.currentEvaluation.id, { score });
      set((state) => ({
        lineages: state.lineages.map((l) =>
          l.id === lineageId && l.currentEvaluation
            ? { ...l, currentEvaluation: { ...l.currentEvaluation, score } }
            : l
        ),
      }));
    } else {
      const evaluation = queries.createEvaluation(lineage.currentArtifact.id, score);
      set((state) => ({
        lineages: state.lineages.map((l) =>
          l.id === lineageId ? { ...l, currentEvaluation: evaluation } : l
        ),
      }));
    }
  },

  setComment: (lineageId: string, comment: string) => {
    const lineage = get().lineages.find((l) => l.id === lineageId);
    if (!lineage?.currentEvaluation) return;

    queries.updateEvaluation(lineage.currentEvaluation.id, { comment });
    set((state) => ({
      lineages: state.lineages.map((l) =>
        l.id === lineageId && l.currentEvaluation
          ? { ...l, currentEvaluation: { ...l.currentEvaluation, comment } }
          : l
      ),
    }));
  },

  setDirective: (lineageId: string, type: 'sticky' | 'oneshot', content: string) => {
    if (type === 'sticky') {
      queries.updateLineage(lineageId, { directiveSticky: content });
    } else {
      queries.updateLineage(lineageId, { directiveOneshot: content });
    }
    set((state) => ({
      lineages: state.lineages.map((l) =>
        l.id === lineageId
          ? {
              ...l,
              directiveSticky: type === 'sticky' ? content : l.directiveSticky,
              directiveOneshot: type === 'oneshot' ? content : l.directiveOneshot,
            }
          : l
      ),
    }));
  },

  clearDirective: (lineageId: string, type: 'sticky' | 'oneshot') => {
    if (type === 'sticky') {
      queries.updateLineage(lineageId, { directiveSticky: null });
    } else {
      queries.updateLineage(lineageId, { directiveOneshot: null });
    }
    set((state) => ({
      lineages: state.lineages.map((l) =>
        l.id === lineageId
          ? {
              ...l,
              directiveSticky: type === 'sticky' ? null : l.directiveSticky,
              directiveOneshot: type === 'oneshot' ? null : l.directiveOneshot,
            }
          : l
      ),
    }));
  },

  regenerateUnlocked: async (sessionId, generateArtifact) => {
    const unlockedLineages = get().getUnlockedLineages();
    if (unlockedLineages.length === 0) return;

    set({ isRegenerating: true });

    try {
      const currentCycle = queries.getCurrentCycle(sessionId);
      const nextCycle = currentCycle + 1;

      const updatedLineages = await Promise.all(
        get().lineages.map(async (lineage) => {
          if (lineage.isLocked) return lineage;

          // Clear oneshot directive after use
          if (lineage.directiveOneshot) {
            queries.clearOneshotDirective(lineage.id);
          }

          // Generate new artifact
          const content = await generateArtifact(lineage, nextCycle);
          const artifact = queries.createArtifact(lineage.id, nextCycle, content);

          return {
            ...lineage,
            directiveOneshot: null,
            currentArtifact: artifact,
            currentEvaluation: null,
            cycle: nextCycle,
          };
        })
      );

      set({ lineages: updatedLineages, isRegenerating: false });
    } catch (e) {
      set({ error: (e as Error).message, isRegenerating: false });
    }
  },

  canRegenerate: () => {
    const unlockedLineages = get().getUnlockedLineages();
    if (unlockedLineages.length === 0) return false;
    return unlockedLineages.every((l) => l.currentEvaluation !== null);
  },

  getUnlockedLineages: () => {
    return get().lineages.filter((l) => !l.isLocked);
  },
}));
