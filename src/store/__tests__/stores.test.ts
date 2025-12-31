/**
 * Zustand Store Tests
 *
 * Tests for the Zustand state management stores.
 * These tests verify store actions and state transitions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "@testing-library/react";
import type { Session } from "../../types";

// Mock the database queries
vi.mock("../../db/queries", () => ({
  getAllSessions: vi.fn(() => []),
  getSession: vi.fn(),
  createSession: vi.fn((input) => ({
    id: "new-session-id",
    name: input.name,
    need: input.need,
    constraints: input.constraints || null,
    inputPrompt: input.inputPrompt || null,
    initialAgentCount: input.initialAgentCount || 4,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })),
  updateSession: vi.fn(),
  deleteSession: vi.fn(),
  getLineagesBySession: vi.fn(() => []),
  getLatestArtifact: vi.fn(() => null),
  getEvaluationForArtifact: vi.fn(() => null),
  createLineage: vi.fn((sessionId, label, strategyTag) => ({
    id: `lineage-${label}`,
    sessionId,
    label,
    strategyTag,
    isLocked: false,
    directiveSticky: null,
    directiveOneshot: null,
    createdAt: Date.now(),
  })),
  createArtifact: vi.fn((lineageId, cycle, content) => ({
    id: `artifact-${lineageId}-${cycle}`,
    lineageId,
    cycle,
    content,
    metadata: null,
    createdAt: Date.now(),
  })),
  createEvaluation: vi.fn((artifactId, score) => ({
    id: `eval-${artifactId}`,
    artifactId,
    score,
    comment: null,
    createdAt: Date.now(),
  })),
  updateEvaluation: vi.fn(),
  updateLineage: vi.fn(),
  getCurrentCycle: vi.fn(() => 1),
  clearOneshotDirective: vi.fn(),
  createAgent: vi.fn(),
}));

// Mock training signal recorder
vi.mock("../../services/training-signal/recorder", () => ({
  recordAgentCreated: vi.fn(),
  recordArtifactScored: vi.fn(),
  recordLineageLocked: vi.fn(),
}));

// Mock agent executor
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
  generateDefaultTestInput: vi.fn((need) => need),
}));

// Mock evolution pipeline
vi.mock("../../services/evolution-pipeline", () => ({
  runEvolutionPipeline: vi.fn(),
}));

// Mock ID generator
vi.mock("../../utils/id", () => ({
  generateId: vi.fn(() => "test-id"),
}));

describe("useUIStore", () => {
  let useUIStore: typeof import("../../store/ui").useUIStore;

  beforeEach(async () => {
    vi.resetModules();
    const module = await import("../../store/ui");
    useUIStore = module.useUIStore;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("has correct initial state", () => {
    const state = useUIStore.getState();

    expect(state.activePanel).toBe("trainer");
    expect(state.selectedLineageId).toBe(null);
    expect(state.isRightPanelCollapsed).toBe(false);
    expect(state.expandedCardId).toBe(null);
  });

  describe("setActivePanel", () => {
    it("sets the active panel", () => {
      act(() => {
        useUIStore.getState().setActivePanel("directives");
      });

      expect(useUIStore.getState().activePanel).toBe("directives");
    });

    it("can set panel to null", () => {
      act(() => {
        useUIStore.getState().setActivePanel(null);
      });

      expect(useUIStore.getState().activePanel).toBe(null);
    });
  });

  describe("setSelectedLineage", () => {
    it("sets selected lineage ID", () => {
      act(() => {
        useUIStore.getState().setSelectedLineage("lineage-123");
      });

      expect(useUIStore.getState().selectedLineageId).toBe("lineage-123");
    });

    it("can clear selected lineage", () => {
      act(() => {
        useUIStore.getState().setSelectedLineage("lineage-123");
        useUIStore.getState().setSelectedLineage(null);
      });

      expect(useUIStore.getState().selectedLineageId).toBe(null);
    });
  });

  describe("toggleRightPanel", () => {
    it("toggles collapsed state", () => {
      expect(useUIStore.getState().isRightPanelCollapsed).toBe(false);

      act(() => {
        useUIStore.getState().toggleRightPanel();
      });

      expect(useUIStore.getState().isRightPanelCollapsed).toBe(true);

      act(() => {
        useUIStore.getState().toggleRightPanel();
      });

      expect(useUIStore.getState().isRightPanelCollapsed).toBe(false);
    });
  });

  describe("expandCard / closeExpandedCard", () => {
    it("expands a card", () => {
      act(() => {
        useUIStore.getState().expandCard("card-123");
      });

      expect(useUIStore.getState().expandedCardId).toBe("card-123");
    });

    it("closes expanded card", () => {
      act(() => {
        useUIStore.getState().expandCard("card-123");
        useUIStore.getState().closeExpandedCard();
      });

      expect(useUIStore.getState().expandedCardId).toBe(null);
    });
  });

  describe("openDirectivesForLineage", () => {
    it("opens directives panel and selects lineage", () => {
      act(() => {
        useUIStore.getState().openDirectivesForLineage("lineage-456");
      });

      expect(useUIStore.getState().activePanel).toBe("directives");
      expect(useUIStore.getState().selectedLineageId).toBe("lineage-456");
    });
  });
});

describe("useModelStore", () => {
  let useModelStore: typeof import("../../store/model").useModelStore;
  let getModelById: typeof import("../../store/model").getModelById;
  let getModelsByTier: typeof import("../../store/model").getModelsByTier;
  let AVAILABLE_MODELS: typeof import("../../store/model").AVAILABLE_MODELS;

  beforeEach(async () => {
    vi.resetModules();
    // Clear localStorage to reset persisted state
    localStorage.clear();
    const module = await import("../../store/model");
    useModelStore = module.useModelStore;
    getModelById = module.getModelById;
    getModelsByTier = module.getModelsByTier;
    AVAILABLE_MODELS = module.AVAILABLE_MODELS;
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe("initial state", () => {
    it("has default model IDs", () => {
      const state = useModelStore.getState();

      // Default should be claude or env variable
      expect(state.trainerModelId).toBeDefined();
      expect(state.agentModelId).toBeDefined();
    });
  });

  describe("setTrainerModel", () => {
    it("sets the trainer model", () => {
      act(() => {
        useModelStore.getState().setTrainerModel("azure/gpt-4o");
      });

      expect(useModelStore.getState().trainerModelId).toBe("azure/gpt-4o");
    });
  });

  describe("setAgentModel", () => {
    it("sets the agent model", () => {
      act(() => {
        useModelStore.getState().setAgentModel("google/gemini-2.5-pro");
      });

      expect(useModelStore.getState().agentModelId).toBe(
        "google/gemini-2.5-pro"
      );
    });
  });

  describe("getTrainerModel", () => {
    it("returns ModelInfo for valid model", () => {
      act(() => {
        useModelStore.getState().setTrainerModel("azure/gpt-4o");
      });

      const model = useModelStore.getState().getTrainerModel();

      expect(model).toBeDefined();
      expect(model?.id).toBe("azure/gpt-4o");
      expect(model?.name).toBe("GPT-4o");
    });

    it("returns undefined for invalid model", () => {
      act(() => {
        useModelStore.getState().setTrainerModel("invalid-model");
      });

      const model = useModelStore.getState().getTrainerModel();

      expect(model).toBeUndefined();
    });
  });

  describe("getModelById helper", () => {
    it("returns model info for valid ID", () => {
      const model = getModelById("azure/gpt-4o");

      expect(model).toBeDefined();
      expect(model?.name).toBe("GPT-4o");
    });

    it("returns undefined for invalid ID", () => {
      const model = getModelById("nonexistent");

      expect(model).toBeUndefined();
    });
  });

  describe("getModelsByTier helper", () => {
    it("returns high-end models", () => {
      const models = getModelsByTier("high-end");

      expect(models.length).toBeGreaterThan(0);
      expect(models.every((m) => m.tier === "high-end")).toBe(true);
    });

    it("returns standard models", () => {
      const models = getModelsByTier("standard");

      expect(models.length).toBeGreaterThan(0);
      expect(models.every((m) => m.tier === "standard")).toBe(true);
    });

    it("returns economy models", () => {
      const models = getModelsByTier("economy");

      expect(models.length).toBeGreaterThan(0);
      expect(models.every((m) => m.tier === "economy")).toBe(true);
    });
  });

  describe("AVAILABLE_MODELS", () => {
    it("contains all required fields", () => {
      for (const model of AVAILABLE_MODELS) {
        expect(model.id).toBeDefined();
        expect(model.name).toBeDefined();
        expect(model.provider).toBeDefined();
        expect(model.tier).toBeDefined();
        expect(model.description).toBeDefined();
      }
    });

    it("has models from multiple providers", () => {
      const providers = new Set(AVAILABLE_MODELS.map((m) => m.provider));

      expect(providers.size).toBeGreaterThanOrEqual(2);
    });
  });
});

describe("useSessionStore", () => {
  let useSessionStore: typeof import("../../store/session").useSessionStore;
  let queries: typeof import("../../db/queries");

  beforeEach(async () => {
    vi.resetModules();
    const module = await import("../../store/session");
    useSessionStore = module.useSessionStore;
    queries = await import("../../db/queries");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("has correct initial state", () => {
    const state = useSessionStore.getState();

    expect(state.sessions).toEqual([]);
    expect(state.currentSession).toBe(null);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBe(null);
  });

  describe("loadSessions", () => {
    it("loads sessions from database", () => {
      const mockSessions: Session[] = [
        {
          id: "1",
          name: "Session 1",
          need: "Need 1",
          constraints: null,
          inputPrompt: null,
          initialAgentCount: 4,
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: "2",
          name: "Session 2",
          need: "Need 2",
          constraints: null,
          inputPrompt: null,
          initialAgentCount: 4,
          createdAt: 2,
          updatedAt: 2,
        },
      ];
      vi.mocked(queries.getAllSessions).mockReturnValue(mockSessions);

      act(() => {
        useSessionStore.getState().loadSessions();
      });

      expect(useSessionStore.getState().sessions).toEqual(mockSessions);
      expect(useSessionStore.getState().error).toBe(null);
    });

    it("handles errors", () => {
      vi.mocked(queries.getAllSessions).mockImplementation(() => {
        throw new Error("Database error");
      });

      act(() => {
        useSessionStore.getState().loadSessions();
      });

      expect(useSessionStore.getState().error).toBe("Database error");
    });
  });

  describe("loadSession", () => {
    it("loads a specific session", () => {
      const mockSession: Session = {
        id: "1",
        name: "Session 1",
        need: "Need 1",
        constraints: null,
        inputPrompt: null,
        initialAgentCount: 4,
        createdAt: 1,
        updatedAt: 1,
      };
      vi.mocked(queries.getSession).mockReturnValue(mockSession);

      act(() => {
        useSessionStore.getState().loadSession("1");
      });

      expect(useSessionStore.getState().currentSession).toEqual(mockSession);
    });
  });

  describe("createSession", () => {
    it("creates a new session", () => {
      const input = { name: "New Session", need: "Test need" };

      act(() => {
        useSessionStore.getState().createSession(input);
      });

      const result = useSessionStore.getState().currentSession;
      expect(result?.name).toBe("New Session");
      expect(result?.need).toBe("Test need");
      expect(useSessionStore.getState().sessions).toContainEqual(result);
    });
  });

  describe("deleteSession", () => {
    it("removes session from state", () => {
      // Setup: create a session first
      act(() => {
        useSessionStore.getState().createSession({
          name: "To Delete",
          need: "Delete me",
        });
      });

      const session = useSessionStore.getState().sessions[0];

      act(() => {
        useSessionStore.getState().deleteSession(session.id);
      });

      expect(useSessionStore.getState().sessions).not.toContainEqual(session);
      expect(useSessionStore.getState().currentSession).toBe(null);
    });
  });

  describe("setCurrentSession", () => {
    it("sets current session directly", () => {
      const session: Session = {
        id: "direct-set",
        name: "Direct",
        need: "Need",
        constraints: null,
        inputPrompt: null,
        initialAgentCount: 4,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      act(() => {
        useSessionStore.getState().setCurrentSession(session);
      });

      expect(useSessionStore.getState().currentSession).toEqual(session);
    });
  });
});

describe("useLineageStore", () => {
  let useLineageStore: typeof import("../../store/lineages").useLineageStore;

  beforeEach(async () => {
    vi.resetModules();
    const module = await import("../../store/lineages");
    useLineageStore = module.useLineageStore;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("has correct initial state", () => {
    const state = useLineageStore.getState();

    expect(state.lineages).toEqual([]);
    expect(state.isLoading).toBe(false);
    expect(state.isRegenerating).toBe(false);
    expect(state.error).toBe(null);
  });

  describe("createInitialLineages", () => {
    it("creates lineages with artifacts", () => {
      const strategies = [
        { label: "A" as const, strategyTag: "concise", content: "Content A" },
        { label: "B" as const, strategyTag: "detailed", content: "Content B" },
      ];

      act(() => {
        useLineageStore
          .getState()
          .createInitialLineages("session-1", strategies);
      });

      const state = useLineageStore.getState();
      expect(state.lineages).toHaveLength(2);
      expect(state.lineages[0].label).toBe("A");
      expect(state.lineages[1].label).toBe("B");
      expect(state.lineages[0].currentArtifact).toBeDefined();
    });
  });

  describe("toggleLock", () => {
    beforeEach(() => {
      // Setup lineages
      act(() => {
        useLineageStore
          .getState()
          .createInitialLineages("session-1", [
            { label: "A" as const, strategyTag: "test", content: "Test" },
          ]);
      });
    });

    it("toggles lock state", () => {
      const lineageId = useLineageStore.getState().lineages[0].id;

      expect(useLineageStore.getState().lineages[0].isLocked).toBe(false);

      act(() => {
        useLineageStore.getState().toggleLock(lineageId);
      });

      expect(useLineageStore.getState().lineages[0].isLocked).toBe(true);

      act(() => {
        useLineageStore.getState().toggleLock(lineageId);
      });

      expect(useLineageStore.getState().lineages[0].isLocked).toBe(false);
    });
  });

  describe("setScore", () => {
    beforeEach(() => {
      act(() => {
        useLineageStore
          .getState()
          .createInitialLineages("session-1", [
            { label: "A" as const, strategyTag: "test", content: "Test" },
          ]);
      });
    });

    it("creates evaluation when none exists", () => {
      const lineageId = useLineageStore.getState().lineages[0].id;

      act(() => {
        useLineageStore.getState().setScore(lineageId, 8);
      });

      expect(
        useLineageStore.getState().lineages[0].currentEvaluation
      ).toBeDefined();
      expect(
        useLineageStore.getState().lineages[0].currentEvaluation?.score
      ).toBe(8);
    });
  });

  describe("setDirective", () => {
    beforeEach(() => {
      act(() => {
        useLineageStore
          .getState()
          .createInitialLineages("session-1", [
            { label: "A" as const, strategyTag: "test", content: "Test" },
          ]);
      });
    });

    it("sets sticky directive", () => {
      const lineageId = useLineageStore.getState().lineages[0].id;

      act(() => {
        useLineageStore
          .getState()
          .addDirective(lineageId, "sticky", "Be more concise");
      });

      expect(useLineageStore.getState().lineages[0].directiveSticky).toContain(
        "Be more concise"
      );
    });

    it("sets oneshot directive", () => {
      const lineageId = useLineageStore.getState().lineages[0].id;

      act(() => {
        useLineageStore
          .getState()
          .addDirective(lineageId, "oneshot", "Try a different approach");
      });

      expect(useLineageStore.getState().lineages[0].directiveOneshot).toContain(
        "Try a different approach"
      );
    });
  });

  describe("clearDirective", () => {
    beforeEach(() => {
      act(() => {
        useLineageStore
          .getState()
          .createInitialLineages("session-1", [
            { label: "A" as const, strategyTag: "test", content: "Test" },
          ]);
        const lineageId = useLineageStore.getState().lineages[0].id;
        useLineageStore
          .getState()
          .addDirective(lineageId, "sticky", "Some directive");
      });
    });

    it("clears sticky directive", () => {
      const lineageId = useLineageStore.getState().lineages[0].id;

      act(() => {
        useLineageStore.getState().clearDirectives(lineageId, "sticky");
      });

      expect(useLineageStore.getState().lineages[0].directiveSticky).toBeNull();
    });
  });

  describe("getUnlockedLineages", () => {
    beforeEach(() => {
      act(() => {
        useLineageStore.getState().createInitialLineages("session-1", [
          { label: "A" as const, strategyTag: "test1", content: "Test 1" },
          { label: "B" as const, strategyTag: "test2", content: "Test 2" },
          { label: "C" as const, strategyTag: "test3", content: "Test 3" },
        ]);
      });
    });

    it("returns all lineages when none locked", () => {
      const unlocked = useLineageStore.getState().getUnlockedLineages();
      expect(unlocked).toHaveLength(3);
    });

    it("excludes locked lineages", () => {
      const lineageId = useLineageStore.getState().lineages[0].id;

      act(() => {
        useLineageStore.getState().toggleLock(lineageId);
      });

      const unlocked = useLineageStore.getState().getUnlockedLineages();
      expect(unlocked).toHaveLength(2);
      expect(unlocked.find((l) => l.id === lineageId)).toBeUndefined();
    });
  });

  describe("canRegenerate", () => {
    beforeEach(() => {
      act(() => {
        useLineageStore.getState().createInitialLineages("session-1", [
          { label: "A" as const, strategyTag: "test1", content: "Test 1" },
          { label: "B" as const, strategyTag: "test2", content: "Test 2" },
        ]);
      });
    });

    it("returns false when no evaluations", () => {
      expect(useLineageStore.getState().canRegenerate()).toBe(false);
    });

    it("returns true when all unlocked have evaluations", () => {
      const lineages = useLineageStore.getState().lineages;

      act(() => {
        useLineageStore.getState().setScore(lineages[0].id, 7);
        useLineageStore.getState().setScore(lineages[1].id, 5);
      });

      expect(useLineageStore.getState().canRegenerate()).toBe(true);
    });

    it("returns false when some unlocked lack evaluations", () => {
      const lineages = useLineageStore.getState().lineages;

      act(() => {
        useLineageStore.getState().setScore(lineages[0].id, 7);
        // lineages[1] has no evaluation
      });

      expect(useLineageStore.getState().canRegenerate()).toBe(false);
    });
  });

  describe("getExistingLabels", () => {
    it("returns labels of all lineages", () => {
      act(() => {
        useLineageStore.getState().createInitialLineages("session-1", [
          { label: "A" as const, strategyTag: "test1", content: "Test 1" },
          { label: "C" as const, strategyTag: "test3", content: "Test 3" },
        ]);
      });

      const labels = useLineageStore.getState().getExistingLabels();
      expect(labels).toEqual(["A", "C"]);
    });
  });
});
