/**
 * Progress Store
 *
 * Zustand store for tracking multi-step operation progress.
 * Provides real-time feedback during agent creation and evolution.
 */

import { create } from "zustand";
import type {
  OperationType,
  OperationProgress,
  ProgressItem,
  ProgressStage,
  ProgressEmitter,
} from "../types/progress";
import { generateId } from "../utils/id";

interface ProgressState {
  currentOperation: OperationProgress | null;

  // Actions
  startOperation: (
    type: OperationType,
    items: Pick<ProgressItem, "id" | "label">[]
  ) => string;
  updateStage: (stage: ProgressStage, stageLabel: string) => void;
  updateItem: (itemId: string, update: Partial<ProgressItem>) => void;
  completeItem: (itemId: string) => void;
  failItem: (itemId: string, error: string) => void;
  completeOperation: () => void;
  failOperation: (error: string) => void;
  clearOperation: () => void;
}

export const useProgressStore = create<ProgressState>((set, get) => ({
  currentOperation: null,

  startOperation: (type, items) => {
    const operationId = generateId();
    const progressItems: ProgressItem[] = items.map((item) => ({
      ...item,
      stage: "generating_agents" as ProgressStage,
      status: "pending" as const,
    }));

    set({
      currentOperation: {
        id: operationId,
        type,
        totalItems: items.length,
        completedItems: 0,
        currentStage: "generating_agents",
        stageLabel: "Starting...",
        items: progressItems,
        startedAt: Date.now(),
      },
    });

    return operationId;
  },

  updateStage: (stage, stageLabel) => {
    const op = get().currentOperation;
    if (!op) return;

    set({
      currentOperation: {
        ...op,
        currentStage: stage,
        stageLabel,
      },
    });
  },

  updateItem: (itemId, update) => {
    const op = get().currentOperation;
    if (!op) return;

    set({
      currentOperation: {
        ...op,
        items: op.items.map((item) =>
          item.id === itemId ? { ...item, ...update } : item
        ),
      },
    });
  },

  completeItem: (itemId) => {
    const op = get().currentOperation;
    if (!op) return;

    const updatedItems = op.items.map((item) =>
      item.id === itemId ? { ...item, status: "completed" as const } : item
    );
    const completedCount = updatedItems.filter(
      (i) => i.status === "completed"
    ).length;

    set({
      currentOperation: {
        ...op,
        items: updatedItems,
        completedItems: completedCount,
      },
    });
  },

  failItem: (itemId, error) => {
    const op = get().currentOperation;
    if (!op) return;

    set({
      currentOperation: {
        ...op,
        items: op.items.map((item) =>
          item.id === itemId
            ? { ...item, status: "error" as const, error }
            : item
        ),
      },
    });
  },

  completeOperation: () => {
    const op = get().currentOperation;
    if (!op) return;

    set({
      currentOperation: {
        ...op,
        currentStage: "complete",
        stageLabel: "Complete",
        completedItems: op.totalItems,
        items: op.items.map((item) => ({
          ...item,
          status: item.status === "error" ? "error" : "completed",
        })),
      },
    });

    // Auto-clear after a short delay
    setTimeout(() => {
      get().clearOperation();
    }, 1000);
  },

  failOperation: (error) => {
    const op = get().currentOperation;
    if (!op) return;

    set({
      currentOperation: {
        ...op,
        error,
        stageLabel: `Error: ${error}`,
      },
    });
  },

  clearOperation: () => {
    set({ currentOperation: null });
  },
}));

/**
 * Creates a progress emitter bound to the current operation.
 * Pass this to async functions that need to report progress.
 */
export function createProgressEmitter(): ProgressEmitter {
  const store = useProgressStore.getState();

  return {
    stage: (stage: ProgressStage, label: string) => {
      store.updateStage(stage, label);
    },
    itemProgress: (itemId: string, stage: ProgressStage) => {
      store.updateItem(itemId, { stage, status: "in_progress" });
    },
    itemComplete: (itemId: string) => {
      store.completeItem(itemId);
    },
    itemError: (itemId: string, error: string) => {
      store.failItem(itemId, error);
    },
  };
}
