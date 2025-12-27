import { create } from 'zustand';
import type { AgentDefinition } from '../types/agent';
import * as queries from '../db/queries';

interface AgentState {
  // Map lineage ID -> agent definition
  agents: Map<string, AgentDefinition>;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadAgentsForSession: (sessionId: string) => void;
  getAgentForLineage: (lineageId: string) => AgentDefinition | undefined;
  updateAgent: (lineageId: string, updates: Partial<AgentDefinition>) => void;
  setAgent: (lineageId: string, agent: AgentDefinition) => void;
  createAgent: (lineageId: string, agent: AgentDefinition) => AgentDefinition;
  getAgentHistory: (lineageId: string) => AgentDefinition[];
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: new Map(),
  isLoading: false,
  error: null,

  loadAgentsForSession: (sessionId: string) => {
    try {
      set({ isLoading: true });
      // Load agents from database
      const agentsMap = queries.getAgentsBySession(sessionId);
      set({ agents: agentsMap, isLoading: false, error: null });
    } catch (e) {
      console.error('Failed to load agents:', e);
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  getAgentForLineage: (lineageId: string) => {
    // First check in-memory cache
    const cached = get().agents.get(lineageId);
    if (cached) return cached;

    // Try loading from database
    const agent = queries.getAgentByLineage(lineageId);
    if (agent) {
      // Update cache
      set((state) => {
        const newAgents = new Map(state.agents);
        newAgents.set(lineageId, agent);
        return { agents: newAgents };
      });
      return agent;
    }

    return undefined;
  },

  updateAgent: (lineageId: string, updates: Partial<AgentDefinition>) => {
    const currentAgent = get().agents.get(lineageId);
    if (!currentAgent) return;

    // Update in database
    queries.updateAgent(currentAgent.id, updates);

    // Update in-memory cache
    const updatedAgent: AgentDefinition = {
      ...currentAgent,
      ...updates,
      updatedAt: Date.now(),
    };

    set((state) => {
      const newAgents = new Map(state.agents);
      newAgents.set(lineageId, updatedAgent);
      return { agents: newAgents };
    });
  },

  setAgent: (lineageId: string, agent: AgentDefinition) => {
    // Save to database
    queries.createAgent(agent, lineageId);

    // Update in-memory cache
    set((state) => {
      const newAgents = new Map(state.agents);
      newAgents.set(lineageId, agent);
      return { agents: newAgents };
    });
  },

  createAgent: (lineageId: string, agent: AgentDefinition) => {
    // Create in database and get back the agent with proper ID
    const savedAgent = queries.createAgent(agent, lineageId);

    // Update in-memory cache
    set((state) => {
      const newAgents = new Map(state.agents);
      newAgents.set(lineageId, savedAgent);
      return { agents: newAgents };
    });

    return savedAgent;
  },

  getAgentHistory: (lineageId: string) => {
    return queries.getAgentHistory(lineageId);
  },
}));
