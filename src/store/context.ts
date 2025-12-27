import { create } from 'zustand';
import type { ContextDocument, ContextExample, TestCase, SessionContext } from '../types/context';
import { generateId } from '../utils/id';

interface ContextState {
  // Context for current session
  documents: ContextDocument[];
  examples: ContextExample[];
  testCases: TestCase[];
  isLoading: boolean;
  error: string | null;

  // Actions
  loadContext: (sessionId: string) => void;
  addDocument: (doc: Omit<ContextDocument, 'id' | 'createdAt'>) => void;
  removeDocument: (id: string) => void;
  addExample: (example: Omit<ContextExample, 'id' | 'createdAt'>) => void;
  removeExample: (id: string) => void;
  addTestCase: (testCase: Omit<TestCase, 'id' | 'createdAt'>) => void;
  removeTestCase: (id: string) => void;
  getContext: () => SessionContext;
}

export const useContextStore = create<ContextState>((set, get) => ({
  documents: [],
  examples: [],
  testCases: [],
  isLoading: false,
  error: null,

  loadContext: (_sessionId: string) => {
    try {
      set({ isLoading: true });
      // For now, initialize with empty arrays (no DB persistence yet)
      // In the future, this would load from SQLite using _sessionId
      set({
        documents: [],
        examples: [],
        testCases: [],
        isLoading: false,
        error: null,
      });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  addDocument: (doc) => {
    const newDocument: ContextDocument = {
      ...doc,
      id: generateId(),
      createdAt: Date.now(),
    };
    set((state) => ({
      documents: [...state.documents, newDocument],
    }));
  },

  removeDocument: (id: string) => {
    set((state) => ({
      documents: state.documents.filter((doc) => doc.id !== id),
    }));
  },

  addExample: (example) => {
    const newExample: ContextExample = {
      ...example,
      id: generateId(),
      createdAt: Date.now(),
    };
    set((state) => ({
      examples: [...state.examples, newExample],
    }));
  },

  removeExample: (id: string) => {
    set((state) => ({
      examples: state.examples.filter((ex) => ex.id !== id),
    }));
  },

  addTestCase: (testCase) => {
    const newTestCase: TestCase = {
      ...testCase,
      id: generateId(),
      createdAt: Date.now(),
    };
    set((state) => ({
      testCases: [...state.testCases, newTestCase],
    }));
  },

  removeTestCase: (id: string) => {
    set((state) => ({
      testCases: state.testCases.filter((tc) => tc.id !== id),
    }));
  },

  getContext: () => {
    const { documents, examples, testCases } = get();
    return { documents, examples, testCases };
  },
}));
