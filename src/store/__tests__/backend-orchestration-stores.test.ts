import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, waitFor } from "@testing-library/react";
import type { AgentDefinition } from "../../types/agent";
import type { LineageWithArtifact, Session } from "../../types";

vi.mock("../../db/queries", () => ({
  getAllSessions: vi.fn(() => []),
  getSession: vi.fn(() => null),
  createSession: vi.fn(),
  updateSession: vi.fn(),
  deleteSession: vi.fn(),
  getLineagesBySession: vi.fn(() => []),
  getLatestArtifact: vi.fn(() => null),
  getEvaluationForArtifact: vi.fn(() => null),
  createLineage: vi.fn(),
  createArtifact: vi.fn(),
  createEvaluation: vi.fn(),
  updateEvaluation: vi.fn(),
  updateLineage: vi.fn(),
  getCurrentCycle: vi.fn(() => 1),
  clearOneshotDirective: vi.fn(),
  createAgent: vi.fn(),
  getAgentsBySession: vi.fn(() => new Map()),
  getAgentByLineage: vi.fn(() => null),
  updateAgent: vi.fn(),
  getAgentHistory: vi.fn(() => []),
}));

vi.mock("../../api/orchestration", () => ({
  isBackendOrchestrationEnabled: vi.fn(() => true),
  listBackendSessions: vi.fn(),
  getBackendSessionSnapshot: vi.fn(),
  createBackendSession: vi.fn(),
  updateBackendSession: vi.fn(),
  deleteBackendSession: vi.fn(),
  runBackendLineage: vi.fn(),
  evaluateBackendArtifact: vi.fn(),
  iterateBackendSession: vi.fn(),
  setBackendLineageLock: vi.fn(),
  addBackendLineage: vi.fn(),
  updateBackendLineageDirectives: vi.fn(),
  getBackendSessionHistory: vi.fn(),
}));

vi.mock("../../services/training-signal/recorder", () => ({
  recordAgentCreated: vi.fn(),
  recordArtifactScored: vi.fn(),
  recordLineageLocked: vi.fn(),
}));

vi.mock("../../services/agent-executor", () => ({
  executeAgentWithFallback: vi.fn(() =>
    Promise.resolve({
      output: "Test output",
      success: true,
      metadata: {
        executionTimeMs: 100,
        inputUsed: "test input",
        stepsExecuted: 1,
      },
      spans: [],
    })
  ),
  generateDefaultTestInput: vi.fn(() => ({ content: "fallback input" })),
}));

vi.mock("../../services/evolution-pipeline", () => ({
  runEvolutionPipeline: vi.fn(),
}));

vi.mock("../../utils/id", () => ({
  generateId: vi.fn(() => "generated-id"),
}));

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-1",
    name: "Session",
    need: "Need",
    constraints: null,
    inputPrompt: "Initial input",
    initialAgentCount: 1,
    trainerMessages: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function makeAgent(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    id: "agent-1",
    lineageId: "lineage-1",
    name: "Agent",
    description: "Desc",
    version: 1,
    systemPrompt: "Prompt",
    tools: [],
    flow: [],
    memory: {
      type: "buffer",
      config: {
        maxMessages: 10,
        maxTokens: 4000,
      },
    },
    parameters: {
      model: "model",
      temperature: 0.5,
      maxTokens: 1024,
      topP: 0.95,
    },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function makeLineage(overrides: Partial<LineageWithArtifact> = {}): LineageWithArtifact {
  return {
    id: "lineage-1",
    sessionId: "session-1",
    label: "A",
    strategyTag: "Concise",
    isLocked: false,
    directiveSticky: [],
    directiveOneshot: [],
    createdAt: 1,
    cycle: 1,
    currentArtifact: {
      id: "artifact-1",
      lineageId: "lineage-1",
      cycle: 1,
      content: "Output",
      metadata: null,
      createdAt: 1,
    },
    currentEvaluation: null,
    ...overrides,
  };
}

function makeSnapshot(overrides?: {
  session?: Partial<Session>;
  lineages?: LineageWithArtifact[];
  agents?: Map<string, AgentDefinition>;
}) {
  return {
    session: makeSession(overrides?.session),
    lineages: overrides?.lineages ?? [makeLineage()],
    agentsByLineage:
      overrides?.agents ?? new Map<string, AgentDefinition>([["lineage-1", makeAgent()]]),
  };
}

describe("backend orchestration store behavior", () => {
  let useSessionStore: typeof import("../../store/session").useSessionStore;
  let useLineageStore: typeof import("../../store/lineages").useLineageStore;
  let useAgentStore: typeof import("../../store/agents").useAgentStore;
  let queries: typeof import("../../db/queries");
  let orchestration: typeof import("../../api/orchestration");
  let agentExecutor: typeof import("../../services/agent-executor");

  beforeEach(async () => {
    vi.resetModules();
    useSessionStore = (await import("../../store/session")).useSessionStore;
    useLineageStore = (await import("../../store/lineages")).useLineageStore;
    useAgentStore = (await import("../../store/agents")).useAgentStore;
    queries = await import("../../db/queries");
    orchestration = await import("../../api/orchestration");
    agentExecutor = await import("../../services/agent-executor");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("useSessionStore backend mode", () => {
    it("loads sessions from backend", async () => {
      vi.mocked(orchestration.listBackendSessions).mockResolvedValueOnce([
        makeSession({ id: "s1" }),
        makeSession({ id: "s2", name: "Session 2" }),
      ]);

      act(() => {
        useSessionStore.getState().loadSessions();
      });

      await waitFor(() => {
        expect(useSessionStore.getState().sessions).toHaveLength(2);
      });
      expect(queries.getAllSessions).not.toHaveBeenCalled();
    });

    it("handles backend loadSessions failures", async () => {
      vi.mocked(orchestration.listBackendSessions).mockRejectedValueOnce(
        new Error("backend unavailable")
      );

      act(() => {
        useSessionStore.getState().loadSessions();
      });

      await waitFor(() => {
        expect(useSessionStore.getState().error).toBe("backend unavailable");
      });
      expect(useSessionStore.getState().isLoading).toBe(false);
    });

    it("updates session via backend and syncs current session", async () => {
      const current = makeSession({ id: "s1", inputPrompt: "old" });
      useSessionStore.setState({
        sessions: [current],
        currentSession: current,
        isLoading: false,
        error: null,
      });
      vi.mocked(orchestration.updateBackendSession).mockResolvedValueOnce(
        makeSession({ id: "s1", inputPrompt: "new prompt" })
      );

      act(() => {
        useSessionStore.getState().updateSession("s1", { inputPrompt: "new prompt" });
      });

      await waitFor(() => {
        expect(useSessionStore.getState().currentSession?.inputPrompt).toBe("new prompt");
      });
      expect(queries.updateSession).not.toHaveBeenCalled();
    });

    it("deletes session via backend and clears current", async () => {
      const current = makeSession({ id: "s1" });
      useSessionStore.setState({
        sessions: [current],
        currentSession: current,
        isLoading: false,
        error: null,
      });
      vi.mocked(orchestration.deleteBackendSession).mockResolvedValueOnce();

      act(() => {
        useSessionStore.getState().deleteSession("s1");
      });

      await waitFor(() => {
        expect(useSessionStore.getState().sessions).toEqual([]);
      });
      expect(useSessionStore.getState().currentSession).toBe(null);
      expect(queries.deleteSession).not.toHaveBeenCalled();
    });

    it("surfaces backend delete failures", async () => {
      const current = makeSession({ id: "s1" });
      useSessionStore.setState({
        sessions: [current],
        currentSession: current,
        isLoading: false,
        error: null,
      });
      vi.mocked(orchestration.deleteBackendSession).mockRejectedValueOnce(
        new Error("delete failed")
      );

      act(() => {
        useSessionStore.getState().deleteSession("s1");
      });

      await waitFor(() => {
        expect(useSessionStore.getState().error).toBe("delete failed");
      });
      expect(useSessionStore.getState().sessions).toHaveLength(1);
    });
  });

  describe("useLineageStore backend mode", () => {
    it("adds directive using backend API", async () => {
      const lineage = makeLineage({ directiveSticky: ["existing"] });
      useLineageStore.setState({
        lineages: [lineage],
        isLoading: false,
        isRegenerating: false,
        error: null,
      });
      vi.mocked(orchestration.updateBackendLineageDirectives).mockResolvedValueOnce();

      act(() => {
        useLineageStore
          .getState()
          .addDirective(lineage.id, "sticky", "new rule");
      });

      expect(useLineageStore.getState().lineages[0].directiveSticky).toEqual([
        "existing",
        "new rule",
      ]);
      await waitFor(() => {
        expect(orchestration.updateBackendLineageDirectives).toHaveBeenCalledWith(
          "session-1",
          "A",
          {
            directiveSticky: ["existing", "new rule"],
            directiveOneshot: undefined,
          }
        );
      });
      expect(queries.updateLineage).not.toHaveBeenCalled();
    });

    it("records backend directive API failures", async () => {
      const lineage = makeLineage({ directiveSticky: [] });
      useLineageStore.setState({
        lineages: [lineage],
        isLoading: false,
        isRegenerating: false,
        error: null,
      });
      vi.mocked(orchestration.updateBackendLineageDirectives).mockRejectedValueOnce(
        new Error("directive update failed")
      );

      act(() => {
        useLineageStore.getState().addDirective(lineage.id, "sticky", "rule");
      });

      await waitFor(() => {
        expect(useLineageStore.getState().error).toBe("directive update failed");
      });
    });

    it("removes directive using backend API", async () => {
      const lineage = makeLineage({ directiveSticky: ["rule1", "rule2"] });
      useLineageStore.setState({
        lineages: [lineage],
        isLoading: false,
        isRegenerating: false,
        error: null,
      });
      vi.mocked(orchestration.updateBackendLineageDirectives).mockResolvedValueOnce();

      act(() => {
        useLineageStore.getState().removeDirective(lineage.id, "sticky", 0);
      });

      expect(useLineageStore.getState().lineages[0].directiveSticky).toEqual(["rule2"]);
      await waitFor(() => {
        expect(orchestration.updateBackendLineageDirectives).toHaveBeenCalledWith(
          "session-1",
          "A",
          {
            directiveSticky: ["rule2"],
            directiveOneshot: undefined,
          }
        );
      });
    });

    it("clears directives to empty list in backend mode", async () => {
      const lineage = makeLineage({ directiveSticky: ["rule1"] });
      useLineageStore.setState({
        lineages: [lineage],
        isLoading: false,
        isRegenerating: false,
        error: null,
      });
      vi.mocked(orchestration.updateBackendLineageDirectives).mockResolvedValueOnce();

      act(() => {
        useLineageStore.getState().clearDirectives(lineage.id, "sticky");
      });

      expect(useLineageStore.getState().lineages[0].directiveSticky).toEqual([]);
      await waitFor(() => {
        expect(orchestration.updateBackendLineageDirectives).toHaveBeenCalledWith(
          "session-1",
          "A",
          {
            directiveSticky: [],
            directiveOneshot: undefined,
          }
        );
      });
    });

    it("adds lineage through backend snapshot sync", async () => {
      const snapshot = makeSnapshot({
        lineages: [makeLineage(), makeLineage({ id: "lineage-2", label: "B" })],
        agents: new Map<string, AgentDefinition>([
          ["lineage-1", makeAgent({ lineageId: "lineage-1" })],
          ["lineage-2", makeAgent({ id: "agent-2", lineageId: "lineage-2" })],
        ]),
      });
      vi.mocked(orchestration.addBackendLineage).mockResolvedValueOnce(snapshot);

      await act(async () => {
        await useLineageStore.getState().addLineage("session-1", { label: "B" });
      });

      expect(useLineageStore.getState().lineages).toHaveLength(2);
      expect(useAgentStore.getState().agents.get("lineage-2")?.id).toBe("agent-2");
      expect(useSessionStore.getState().currentSession?.id).toBe("session-1");
      expect(queries.createLineage).not.toHaveBeenCalled();
    });

    it("runs lineage via backend using input prompt when present", async () => {
      const lineage = makeLineage();
      useLineageStore.setState({
        lineages: [lineage],
        isLoading: false,
        isRegenerating: false,
        error: null,
      });
      useSessionStore.setState({
        sessions: [makeSession({ inputPrompt: "custom input" })],
        currentSession: makeSession({ inputPrompt: "custom input" }),
        isLoading: false,
        error: null,
      });
      vi.mocked(orchestration.runBackendLineage).mockResolvedValueOnce();
      vi.mocked(orchestration.getBackendSessionSnapshot).mockResolvedValueOnce(
        makeSnapshot({
          lineages: [makeLineage({ cycle: 2, currentArtifact: { ...lineage.currentArtifact!, cycle: 2 } })],
        })
      );

      await act(async () => {
        await useLineageStore
          .getState()
          .runLineage(lineage.id, "Need", () => undefined);
      });

      expect(orchestration.runBackendLineage).toHaveBeenCalledWith(
        "session-1",
        "A",
        "custom input"
      );
      expect(useLineageStore.getState().lineages[0].cycle).toBe(2);
    });

    it("handles backend runLineage failures", async () => {
      const lineage = makeLineage();
      useLineageStore.setState({
        lineages: [lineage],
        isLoading: false,
        isRegenerating: false,
        error: null,
      });
      useSessionStore.setState({
        sessions: [makeSession({ inputPrompt: "custom input" })],
        currentSession: makeSession({ inputPrompt: "custom input" }),
        isLoading: false,
        error: null,
      });
      vi.mocked(orchestration.runBackendLineage).mockRejectedValueOnce(
        new Error("run failed")
      );

      await act(async () => {
        await useLineageStore
          .getState()
          .runLineage(lineage.id, "Need", () => undefined);
      });

      expect(useLineageStore.getState().error).toBe("run failed");
      expect(useLineageStore.getState().isRegenerating).toBe(false);
    });

    it("runs lineage via backend using fallback test input when prompt is missing", async () => {
      const lineage = makeLineage();
      useLineageStore.setState({
        lineages: [lineage],
        isLoading: false,
        isRegenerating: false,
        error: null,
      });
      useSessionStore.setState({
        sessions: [makeSession({ inputPrompt: null })],
        currentSession: makeSession({ inputPrompt: null }),
        isLoading: false,
        error: null,
      });
      vi.mocked(orchestration.runBackendLineage).mockResolvedValueOnce();
      vi.mocked(orchestration.getBackendSessionSnapshot).mockResolvedValueOnce(
        makeSnapshot()
      );

      await act(async () => {
        await useLineageStore
          .getState()
          .runLineage(lineage.id, "Need for fallback", () => undefined);
      });

      expect(agentExecutor.generateDefaultTestInput).toHaveBeenCalledWith(
        "Need for fallback",
        null
      );
      expect(orchestration.runBackendLineage).toHaveBeenCalledWith(
        "session-1",
        "A",
        "fallback input"
      );
    });

    it("toggles lock through backend and keeps optimistic state", async () => {
      const lineage = makeLineage({ isLocked: false });
      useLineageStore.setState({
        lineages: [lineage],
        isLoading: false,
        isRegenerating: false,
        error: null,
      });
      vi.mocked(orchestration.setBackendLineageLock).mockResolvedValueOnce();
      vi.mocked(orchestration.getBackendSessionSnapshot).mockResolvedValueOnce(
        makeSnapshot({
          lineages: [makeLineage({ isLocked: true })],
        })
      );

      act(() => {
        useLineageStore.getState().toggleLock(lineage.id);
      });

      expect(useLineageStore.getState().lineages[0].isLocked).toBe(true);
      await waitFor(() => {
        expect(orchestration.setBackendLineageLock).toHaveBeenCalledWith(
          "session-1",
          "A",
          true
        );
      });
    });

    it("sets backend score optimistically and calls evaluate API", async () => {
      const lineage = makeLineage({ currentEvaluation: null });
      useLineageStore.setState({
        lineages: [lineage],
        isLoading: false,
        isRegenerating: false,
        error: null,
      });
      vi.mocked(orchestration.evaluateBackendArtifact).mockResolvedValueOnce();

      act(() => {
        useLineageStore.getState().setScore(lineage.id, 9);
      });

      expect(useLineageStore.getState().lineages[0].currentEvaluation?.score).toBe(9);
      await waitFor(() => {
        expect(orchestration.evaluateBackendArtifact).toHaveBeenCalledWith(
          "artifact-1",
          9,
          undefined
        );
      });
    });

    it("sets backend comment with default score when no evaluation exists", async () => {
      const lineage = makeLineage({ currentEvaluation: null });
      useLineageStore.setState({
        lineages: [lineage],
        isLoading: false,
        isRegenerating: false,
        error: null,
      });
      vi.mocked(orchestration.evaluateBackendArtifact).mockResolvedValueOnce();

      act(() => {
        useLineageStore.getState().setComment(lineage.id, "Needs polish");
      });

      expect(useLineageStore.getState().lineages[0].currentEvaluation?.comment).toBe(
        "Needs polish"
      );
      expect(useLineageStore.getState().lineages[0].currentEvaluation?.score).toBe(5);
      await waitFor(() => {
        expect(orchestration.evaluateBackendArtifact).toHaveBeenCalledWith(
          "artifact-1",
          5,
          "Needs polish"
        );
      });
    });

    it("handles backend loadLineages failures", async () => {
      vi.mocked(orchestration.getBackendSessionSnapshot).mockRejectedValueOnce(
        new Error("snapshot failed")
      );

      act(() => {
        useLineageStore.getState().loadLineages("session-1");
      });

      await waitFor(() => {
        expect(useLineageStore.getState().error).toBe("snapshot failed");
      });
      expect(useLineageStore.getState().isLoading).toBe(false);
    });

    it("handles backend iterate failures", async () => {
      useLineageStore.setState({
        lineages: [makeLineage({ isLocked: false })],
        isLoading: false,
        isRegenerating: false,
        error: null,
      });
      vi.mocked(orchestration.iterateBackendSession).mockRejectedValueOnce(
        new Error("iterate failed")
      );

      await act(async () => {
        await useLineageStore
          .getState()
          .regenerateWithFullPipeline("session-1", "Need", () => undefined);
      });

      expect(useLineageStore.getState().error).toBe("iterate failed");
      expect(useLineageStore.getState().isRegenerating).toBe(false);
    });
  });

  describe("useAgentStore backend mode", () => {
    it("loads agents from backend snapshot", async () => {
      const snapshot = makeSnapshot({
        agents: new Map<string, AgentDefinition>([
          ["lineage-1", makeAgent({ id: "agent-1" })],
          ["lineage-2", makeAgent({ id: "agent-2", lineageId: "lineage-2" })],
        ]),
      });
      vi.mocked(orchestration.getBackendSessionSnapshot).mockResolvedValueOnce(
        snapshot
      );

      act(() => {
        useAgentStore.getState().loadAgentsForSession("session-1");
      });

      await waitFor(() => {
        expect(useAgentStore.getState().agents.size).toBe(2);
      });
      expect(queries.getAgentsBySession).not.toHaveBeenCalled();
    });

    it("getAgentForLineage avoids local query fallback in backend mode", () => {
      const cached = makeAgent();
      useAgentStore.setState({
        agents: new Map<string, AgentDefinition>([["lineage-1", cached]]),
        isLoading: false,
        error: null,
      });

      expect(useAgentStore.getState().getAgentForLineage("lineage-1")).toEqual(
        cached
      );
      expect(useAgentStore.getState().getAgentForLineage("missing")).toBeUndefined();
      expect(queries.getAgentByLineage).not.toHaveBeenCalled();
    });

    it("handles backend loadAgents failures", async () => {
      vi.mocked(orchestration.getBackendSessionSnapshot).mockRejectedValueOnce(
        new Error("agent load failed")
      );

      act(() => {
        useAgentStore.getState().loadAgentsForSession("session-1");
      });

      await waitFor(() => {
        expect(useAgentStore.getState().error).toBe("agent load failed");
      });
      expect(useAgentStore.getState().isLoading).toBe(false);
    });
  });
});
