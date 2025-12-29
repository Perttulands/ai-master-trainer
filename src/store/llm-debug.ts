/**
 * LLM Debug Store
 *
 * In-memory Zustand store for capturing LLM call debug information.
 * Data is NOT persisted - cleared on page refresh.
 */

import { create } from 'zustand';
import type { LLMDebugEntry } from '../types/llm-debug';

const MAX_ENTRIES = 100;

interface LLMDebugState {
  entries: LLMDebugEntry[];

  // Actions
  addEntry: (entry: LLMDebugEntry) => void;
  clearEntries: () => void;
  getEntriesBySession: (sessionId: string) => LLMDebugEntry[];
  getErrorCount: (sessionId?: string) => number;
}

export const useLLMDebugStore = create<LLMDebugState>((set, get) => ({
  entries: [],

  addEntry: (entry) => {
    set((state) => ({
      entries: [entry, ...state.entries].slice(0, MAX_ENTRIES),
    }));
  },

  clearEntries: () => {
    set({ entries: [] });
  },

  getEntriesBySession: (sessionId) => {
    return get().entries.filter((e) => e.sessionId === sessionId);
  },

  getErrorCount: (sessionId) => {
    const entries = sessionId
      ? get().entries.filter((e) => e.sessionId === sessionId)
      : get().entries;
    return entries.filter((e) => e.status === 'error').length;
  },
}));

// Generate unique ID for debug entries
let debugIdCounter = 0;
export function generateDebugId(): string {
  debugIdCounter += 1;
  return `debug-${Date.now()}-${debugIdCounter}`;
}
