import { create } from 'zustand';
import type { Session, CreateSessionInput } from '../types';
import * as queries from '../db/queries';
import {
  isBackendOrchestrationEnabled,
  listBackendSessions,
  getBackendSessionSnapshot,
} from '../api/orchestration';

interface SessionState {
  sessions: Session[];
  currentSession: Session | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadSessions: () => void;
  loadSession: (id: string) => void;
  createSession: (input: CreateSessionInput) => Session;
  updateSession: (id: string, updates: Partial<Pick<Session, 'name' | 'need' | 'constraints'>>) => void;
  deleteSession: (id: string) => void;
  setCurrentSession: (session: Session | null) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  currentSession: null,
  isLoading: false,
  error: null,

  loadSessions: () => {
    if (isBackendOrchestrationEnabled()) {
      set({ isLoading: true });
      listBackendSessions()
        .then((sessions) => {
          set({ sessions, isLoading: false, error: null });
        })
        .catch((e) => {
          set({ error: (e as Error).message, isLoading: false });
        });
      return;
    }

    try {
      const sessions = queries.getAllSessions();
      set({ sessions, error: null });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  loadSession: (id: string) => {
    if (isBackendOrchestrationEnabled()) {
      set({ isLoading: true });
      getBackendSessionSnapshot(id)
        .then((snapshot) => {
          set({
            currentSession: snapshot.session,
            isLoading: false,
            error: null,
          });
        })
        .catch((e) => {
          set({ error: (e as Error).message, isLoading: false });
        });
      return;
    }

    try {
      const session = queries.getSession(id);
      set({ currentSession: session, error: null });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  createSession: (input: CreateSessionInput) => {
    const session = queries.createSession(input);
    set((state) => ({
      sessions: [session, ...state.sessions],
      currentSession: session,
    }));
    return session;
  },

  updateSession: (id: string, updates) => {
    queries.updateSession(id, updates);
    const updatedSession = queries.getSession(id);
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id && updatedSession ? updatedSession : s)),
      currentSession: state.currentSession?.id === id ? updatedSession : state.currentSession,
    }));
  },

  deleteSession: (id: string) => {
    queries.deleteSession(id);
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
      currentSession: state.currentSession?.id === id ? null : state.currentSession,
    }));
  },

  setCurrentSession: (session) => {
    set({ currentSession: session });
  },
}));
