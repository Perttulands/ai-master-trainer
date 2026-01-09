import { create } from "zustand";
import type { Lineage, LineageWithArtifact, LineageLabel } from "../types";
import type { AgentDefinition } from "../types/agent";
import type { ExecutionSpan } from "../types/evolution";
import type { ProgressEmitter } from "../types/progress";
import * as queries from "../db/queries";
import {
  executeAgentWithFallback,
  generateDefaultTestInput,
  type ExecutionInput,
  type ExecutionOptions,
} from "../services/agent-executor";
import { runEvolutionPipeline } from "../services/evolution-pipeline";
import { generateId } from "../utils/id";
import {
  recordAgentCreated,
  recordArtifactScored,
  recordLineageLocked,
} from "../services/training-signal/recorder";

interface RegenerateWithAgentsOptions {
  lineage: LineageWithArtifact;
  currentAgent: AgentDefinition | undefined;
  cycle: number;
  need: string;
  previousScore: number;
}

interface LineageState {
  lineages: LineageWithArtifact[];
  isLoading: boolean;
  isRegenerating: boolean;
  error: string | null;

  // Actions
  loadLineages: (sessionId: string) => void;
  createInitialLineages: (
    sessionId: string,
    strategies: { label: LineageLabel; strategyTag: string; content: string }[]
  ) => void;
  createInitialLineagesWithAgents: (
    sessionId: string,
    configs: {
      label: LineageLabel;
      strategyTag: string;
      agent: AgentDefinition;
    }[],
    testInput?: ExecutionInput,
    progressEmitter?: ProgressEmitter
  ) => Promise<void>;
  addLineage: (
    sessionId: string,
    config: {
      label: LineageLabel;
      strategyTag: string;
      agent: AgentDefinition;
    },
    testInput?: ExecutionInput
  ) => Promise<void>;
  toggleLock: (lineageId: string) => void;
  setScore: (lineageId: string, score: number) => void;
  setComment: (lineageId: string, comment: string) => void;
  addDirective: (
    lineageId: string,
    type: "sticky" | "oneshot",
    content: string
  ) => void;
  removeDirective: (
    lineageId: string,
    type: "sticky" | "oneshot",
    index: number
  ) => void;
  clearDirectives: (lineageId: string, type: "sticky" | "oneshot") => void;
  regenerateUnlocked: (
    sessionId: string,
    generateArtifact: (lineage: Lineage, cycle: number) => Promise<string>
  ) => Promise<void>;
  regenerateUnlockedWithAgents: (
    sessionId: string,
    need: string,
    evolveAgent: (
      options: RegenerateWithAgentsOptions
    ) => Promise<AgentDefinition>,
    getAgentForLineage: (lineageId: string) => AgentDefinition | undefined
  ) => Promise<void>;
  regenerateWithFullPipeline: (
    sessionId: string,
    need: string,
    getAgentForLineage: (lineageId: string) => AgentDefinition | undefined,
    progressEmitter?: ProgressEmitter
  ) => Promise<void>;
  canRegenerate: () => boolean;
  getUnlockedLineages: () => LineageWithArtifact[];
  getExistingLabels: () => LineageLabel[];

  // Run single lineage
  runLineage: (
    lineageId: string,
    need: string,
    getAgentForLineage: (lineageId: string) => AgentDefinition | undefined
  ) => Promise<void>;
}

export type { RegenerateWithAgentsOptions };

export const useLineageStore = create<LineageState>((set, get) => ({
  lineages: [],
  isLoading: false,
  isRegenerating: false,
  error: null,

  loadLineages: (sessionId: string) => {
    try {
      set({ isLoading: true });
      const lineages = queries.getLineagesBySession(sessionId);
      const lineagesWithArtifacts: LineageWithArtifact[] = lineages.map(
        (lineage) => {
          const artifact = queries.getLatestArtifact(lineage.id);
          const evaluation = artifact
            ? queries.getEvaluationForArtifact(artifact.id)
            : null;
          return {
            ...lineage,
            currentArtifact: artifact,
            currentEvaluation: evaluation,
            cycle: artifact?.cycle ?? 0,
          };
        }
      );
      set({ lineages: lineagesWithArtifacts, isLoading: false, error: null });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  createInitialLineages: (sessionId, strategies) => {
    const lineagesWithArtifacts: LineageWithArtifact[] = strategies.map(
      (strategy) => {
        const lineage = queries.createLineage(
          sessionId,
          strategy.label,
          strategy.strategyTag
        );
        const artifact = queries.createArtifact(
          lineage.id,
          1,
          strategy.content
        );
        return {
          ...lineage,
          currentArtifact: artifact,
          currentEvaluation: null,
          cycle: 1,
        };
      }
    );
    set({ lineages: lineagesWithArtifacts });
  },

  createInitialLineagesWithAgents: async (
    sessionId,
    configs,
    testInput?: ExecutionInput,
    progressEmitter?: ProgressEmitter
  ) => {
    set({ isLoading: true });

    try {
      // Get session for test input (use inputPrompt if set, otherwise fallback to need)
      const session = queries.getSession(sessionId);
      const input =
        testInput ||
        generateDefaultTestInput(
          session?.need || "Demonstrate your capabilities",
          session?.inputPrompt
        );

      // Update stage to executing agents
      progressEmitter?.stage("executing_agents", "Running agents to produce outputs...");

      const lineagesWithArtifacts: LineageWithArtifact[] = await Promise.all(
        configs.map(async (config) => {
          // Signal that this agent is being executed
          progressEmitter?.itemProgress(config.label, "executing_agents");

          // Create lineage
          const lineage = queries.createLineage(
            sessionId,
            config.label,
            config.strategyTag
          );

          // Create agent linked to lineage
          queries.createAgent(config.agent, lineage.id);

          // Record training signal for agent creation
          try {
            recordAgentCreated(config.agent, lineage.id, sessionId);
          } catch (recordError) {
            console.warn(
              "[Lineages] Failed to record agent creation:",
              recordError
            );
          }

          // Execute agent to produce artifact content with tracking
          const executionOptions: ExecutionOptions = {
            lineageId: lineage.id,
            cycle: 1,
            createRecords: true,
          };
          const result = await executeAgentWithFallback(
            config.agent,
            input,
            executionOptions
          );

          // Create artifact with execution output and span metadata
          const artifact = queries.createArtifact(
            lineage.id,
            1,
            result.output,
            {
              agentId: config.agent.id,
              agentVersion: config.agent.version,
              executionSuccess: result.success,
              error: result.error,
              executionTimeMs: result.metadata.executionTimeMs,
              inputUsed: result.metadata.inputUsed,
              rolloutId: result.metadata.rolloutId,
              attemptId: result.metadata.attemptId,
              stepsExecuted: result.metadata.stepsExecuted,
              spanCount: result.spans?.length ?? 0,
            }
          );

          // Mark this agent as complete
          progressEmitter?.itemComplete(config.label);

          return {
            ...lineage,
            currentArtifact: artifact,
            currentEvaluation: null,
            cycle: 1,
          };
        })
      );

      set({ lineages: lineagesWithArtifacts, isLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  addLineage: async (sessionId, config, testInput?: ExecutionInput) => {
    set({ isLoading: true });

    try {
      // Get session for test input (use inputPrompt if set, otherwise fallback to need)
      const session = queries.getSession(sessionId);
      const input =
        testInput ||
        generateDefaultTestInput(
          session?.need || "Demonstrate your capabilities",
          session?.inputPrompt
        );

      // Create lineage
      const lineage = queries.createLineage(
        sessionId,
        config.label,
        config.strategyTag
      );

      // Create agent linked to lineage
      queries.createAgent(config.agent, lineage.id);

      // Record training signal for agent creation
      try {
        recordAgentCreated(config.agent, lineage.id, sessionId);
      } catch (recordError) {
        console.warn(
          "[Lineages] Failed to record agent creation:",
          recordError
        );
      }

      // Execute agent to produce artifact content with tracking
      const executionOptions: ExecutionOptions = {
        lineageId: lineage.id,
        cycle: 1,
        createRecords: true,
      };
      const result = await executeAgentWithFallback(
        config.agent,
        input,
        executionOptions
      );

      // Create artifact with execution output and span metadata
      const artifact = queries.createArtifact(lineage.id, 1, result.output, {
        agentId: config.agent.id,
        agentVersion: config.agent.version,
        executionSuccess: result.success,
        error: result.error,
        executionTimeMs: result.metadata.executionTimeMs,
        inputUsed: result.metadata.inputUsed,
        rolloutId: result.metadata.rolloutId,
        attemptId: result.metadata.attemptId,
        stepsExecuted: result.metadata.stepsExecuted,
        spanCount: result.spans?.length ?? 0,
      });

      const newLineage: LineageWithArtifact = {
        ...lineage,
        currentArtifact: artifact,
        currentEvaluation: null,
        cycle: 1,
      };

      set((state) => ({
        lineages: [...state.lineages, newLineage],
        isLoading: false,
      }));
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  toggleLock: (lineageId: string) => {
    const lineage = get().lineages.find((l) => l.id === lineageId);
    if (!lineage) return;

    const newLockedState = !lineage.isLocked;
    queries.updateLineage(lineageId, { isLocked: newLockedState });
    set((state) => ({
      lineages: state.lineages.map((l) =>
        l.id === lineageId ? { ...l, isLocked: newLockedState } : l
      ),
    }));

    // Record training signal when lineage is locked (winner selected)
    if (newLockedState) {
      try {
        // Get competitor IDs (other lineages in the same session that are not locked)
        const competitorIds = get()
          .lineages.filter((l) => l.id !== lineageId && !l.isLocked)
          .map((l) => l.id);
        recordLineageLocked(lineageId, competitorIds, lineage.sessionId);
      } catch (recordError) {
        console.warn(
          "[Lineages] Failed to record lineage locked:",
          recordError
        );
      }
    }
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

      // Record training signal for score update
      try {
        recordArtifactScored(
          lineage.currentArtifact,
          score,
          lineage.currentEvaluation.comment ?? undefined,
          lineage.sessionId
        );
      } catch (recordError) {
        console.warn(
          "[Lineages] Failed to record artifact scored:",
          recordError
        );
      }
    } else {
      const evaluation = queries.createEvaluation(
        lineage.currentArtifact.id,
        score
      );
      set((state) => ({
        lineages: state.lineages.map((l) =>
          l.id === lineageId ? { ...l, currentEvaluation: evaluation } : l
        ),
      }));

      // Record training signal for new score
      try {
        recordArtifactScored(lineage.currentArtifact, score, undefined, lineage.sessionId);
      } catch (recordError) {
        console.warn(
          "[Lineages] Failed to record artifact scored:",
          recordError
        );
      }
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

  addDirective: (
    lineageId: string,
    type: "sticky" | "oneshot",
    content: string
  ) => {
    const lineage = get().lineages.find((l) => l.id === lineageId);
    if (!lineage) return;

    const currentDirectives =
      type === "sticky"
        ? lineage.directiveSticky || []
        : lineage.directiveOneshot || [];

    const newDirectives = [...currentDirectives, content];

    if (type === "sticky") {
      queries.updateLineage(lineageId, { directiveSticky: newDirectives });
    } else {
      queries.updateLineage(lineageId, { directiveOneshot: newDirectives });
    }

    set((state) => ({
      lineages: state.lineages.map((l) =>
        l.id === lineageId
          ? {
              ...l,
              directiveSticky:
                type === "sticky" ? newDirectives : l.directiveSticky,
              directiveOneshot:
                type === "oneshot" ? newDirectives : l.directiveOneshot,
            }
          : l
      ),
    }));
  },

  removeDirective: (
    lineageId: string,
    type: "sticky" | "oneshot",
    index: number
  ) => {
    const lineage = get().lineages.find((l) => l.id === lineageId);
    if (!lineage) return;

    const currentDirectives =
      type === "sticky"
        ? lineage.directiveSticky || []
        : lineage.directiveOneshot || [];

    const newDirectives = currentDirectives.filter((_, i) => i !== index);

    if (type === "sticky") {
      queries.updateLineage(lineageId, { directiveSticky: newDirectives });
    } else {
      queries.updateLineage(lineageId, { directiveOneshot: newDirectives });
    }

    set((state) => ({
      lineages: state.lineages.map((l) =>
        l.id === lineageId
          ? {
              ...l,
              directiveSticky:
                type === "sticky" ? newDirectives : l.directiveSticky,
              directiveOneshot:
                type === "oneshot" ? newDirectives : l.directiveOneshot,
            }
          : l
      ),
    }));
  },

  clearDirectives: (lineageId: string, type: "sticky" | "oneshot") => {
    if (type === "sticky") {
      queries.updateLineage(lineageId, { directiveSticky: null });
    } else {
      queries.updateLineage(lineageId, { directiveOneshot: null });
    }
    set((state) => ({
      lineages: state.lineages.map((l) =>
        l.id === lineageId
          ? {
              ...l,
              directiveSticky: type === "sticky" ? null : l.directiveSticky,
              directiveOneshot: type === "oneshot" ? null : l.directiveOneshot,
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
          const artifact = queries.createArtifact(
            lineage.id,
            nextCycle,
            content
          );

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

  regenerateUnlockedWithAgents: async (
    sessionId,
    need,
    evolveAgentFn,
    getAgentForLineage
  ) => {
    const unlockedLineages = get().getUnlockedLineages();
    if (unlockedLineages.length === 0) return;

    set({ isRegenerating: true });

    try {
      const currentCycle = queries.getCurrentCycle(sessionId);
      const nextCycle = currentCycle + 1;
      const session = queries.getSession(sessionId);
      const testInput = generateDefaultTestInput(need, session?.inputPrompt);

      const updatedLineages = await Promise.all(
        get().lineages.map(async (lineage) => {
          if (lineage.isLocked) return lineage;

          // Clear oneshot directive after use
          if (lineage.directiveOneshot) {
            queries.clearOneshotDirective(lineage.id);
          }

          // Get current agent for this lineage
          const currentAgent = getAgentForLineage(lineage.id);
          const previousScore = lineage.currentEvaluation?.score ?? 5;

          // Evolve the agent using the provided function
          const evolvedAgent = await evolveAgentFn({
            lineage,
            currentAgent,
            cycle: nextCycle,
            need,
            previousScore,
          });

          // Save evolved agent to database
          queries.createAgent(evolvedAgent, lineage.id);

          // Execute evolved agent with tracking enabled
          const executionOptions: ExecutionOptions = {
            lineageId: lineage.id,
            cycle: nextCycle,
            createRecords: true,
          };
          const result = await executeAgentWithFallback(
            evolvedAgent,
            testInput,
            executionOptions
          );

          // Create artifact with execution output and span metadata
          const artifact = queries.createArtifact(
            lineage.id,
            nextCycle,
            result.output,
            {
              agentId: evolvedAgent.id,
              agentVersion: evolvedAgent.version,
              executionSuccess: result.success,
              error: result.error,
              executionTimeMs: result.metadata.executionTimeMs,
              inputUsed: result.metadata.inputUsed,
              rolloutId: result.metadata.rolloutId,
              attemptId: result.metadata.attemptId,
              stepsExecuted: result.metadata.stepsExecuted,
              spanCount: result.spans?.length ?? 0,
            }
          );

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

  regenerateWithFullPipeline: async (sessionId, need, getAgentForLineage, progressEmitter) => {
    const unlockedLineages = get().getUnlockedLineages();
    if (unlockedLineages.length === 0) return;

    set({ isRegenerating: true });

    try {
      const currentCycle = queries.getCurrentCycle(sessionId);
      const nextCycle = currentCycle + 1;
      const session = queries.getSession(sessionId);
      const testInput = generateDefaultTestInput(need, session?.inputPrompt);

      const updatedLineages = await Promise.all(
        get().lineages.map(async (lineage) => {
          if (lineage.isLocked) return lineage;

          // Signal that this lineage is being processed
          progressEmitter?.itemProgress(lineage.label, "analyzing_reward");

          // Clear oneshot directive after use
          if (lineage.directiveOneshot) {
            queries.clearOneshotDirective(lineage.id);
          }

          // Get current agent for this lineage
          const currentAgent = getAgentForLineage(lineage.id);
          if (!currentAgent) {
            console.warn(`[Pipeline] No agent found for lineage ${lineage.id}`);
            progressEmitter?.itemError(lineage.label, "No agent found");
            return lineage;
          }

          const previousScore = lineage.currentEvaluation?.score ?? 5;
          const comment = lineage.currentEvaluation?.comment ?? undefined;

          // Generate rollout and attempt IDs for tracking
          const rolloutId = generateId();
          const attemptId = generateId();

          // First, execute the CURRENT agent to get execution spans for credit assignment
          // This allows us to analyze what the current agent did wrong
          let currentExecutionSpans: ExecutionSpan[] = [];
          try {
            const currentExecution = await executeAgentWithFallback(
              { ...currentAgent, lineageId: lineage.id },
              testInput,
              {
                lineageId: lineage.id,
                cycle: lineage.cycle,
                createRecords: false, // Don't create records for analysis run
              }
            );
            currentExecutionSpans = currentExecution.spans ?? [];
          } catch {
            // If execution fails, continue without spans
            console.warn(
              `[Pipeline] Could not get spans for lineage ${lineage.id}`
            );
          }

          // Run the full evolution pipeline with spans for trajectory credit assignment
          const pipelineResult = await runEvolutionPipeline({
            agent: { ...currentAgent, lineageId: lineage.id },
            need,
            score: previousScore,
            comment,
            stickyDirective: lineage.directiveSticky ?? undefined,
            oneshotDirective: lineage.directiveOneshot ?? undefined,
            previousScore: lineage.cycle > 1 ? previousScore : undefined,
            rolloutId,
            attemptId,
            spans: currentExecutionSpans, // Pass spans for trajectory-based credit assignment
            sessionId,
            progressEmitter, // Pass emitter to pipeline for stage updates
          });

          console.log(`[Pipeline] ${lineage.label}: ${pipelineResult.summary}`);
          if (currentExecutionSpans.length > 1) {
            console.log(
              `[Pipeline] ${lineage.label}: Used trajectory credit (${currentExecutionSpans.length} spans)`
            );
          }

          // Save evolved agent to database
          queries.createAgent(pipelineResult.evolvedAgent, lineage.id);

          // Update progress: executing evolved agent
          progressEmitter?.itemProgress(lineage.label, "executing_evolved");

          // Execute evolved agent with full tracking
          const executionOptions: ExecutionOptions = {
            lineageId: lineage.id,
            cycle: nextCycle,
            createRecords: true,
          };
          const result = await executeAgentWithFallback(
            pipelineResult.evolvedAgent,
            testInput,
            executionOptions
          );

          // Create artifact with execution output and full metadata
          const artifact = queries.createArtifact(
            lineage.id,
            nextCycle,
            result.output,
            {
              agentId: pipelineResult.evolvedAgent.id,
              agentVersion: pipelineResult.evolvedAgent.version,
              executionSuccess: result.success,
              error: result.error,
              executionTimeMs: result.metadata.executionTimeMs,
              inputUsed: result.metadata.inputUsed,
              evolutionRecordId: pipelineResult.evolutionRecord.id,
              rolloutId: result.metadata.rolloutId,
              attemptId: result.metadata.attemptId,
              stepsExecuted: result.metadata.stepsExecuted,
              spanCount: result.spans?.length ?? 0,
            }
          );

          // Mark this lineage as complete
          progressEmitter?.itemComplete(lineage.label);

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
      console.error("[Pipeline] Evolution failed:", e);
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

  getExistingLabels: () => {
    return get().lineages.map((l) => l.label);
  },

  // ============ Run Single Lineage (Training mode) ============

  runLineage: async (lineageId, need, getAgentForLineage) => {
    const lineage = get().lineages.find((l) => l.id === lineageId);
    if (!lineage) return;

    set({ isRegenerating: true });

    try {
      // Get current agent
      const currentAgent = getAgentForLineage(lineageId);
      if (!currentAgent) {
        throw new Error(`No agent found for lineage ${lineageId}`);
      }

      // Get session for input prompt
      const session = queries.getSession(lineage.sessionId);

      // Execute current agent (no evolution)
      const nextCycle = lineage.cycle + 1;
      const testInput = generateDefaultTestInput(need, session?.inputPrompt);

      const executionOptions: ExecutionOptions = {
        lineageId: lineage.id,
        cycle: nextCycle,
        createRecords: true,
      };
      const result = await executeAgentWithFallback(
        currentAgent,
        testInput,
        executionOptions
      );

      // Create artifact with same agent version
      const artifact = queries.createArtifact(
        lineage.id,
        nextCycle,
        result.output,
        {
          agentId: currentAgent.id,
          agentVersion: currentAgent.version,
          executionSuccess: result.success,
          error: result.error,
          executionTimeMs: result.metadata.executionTimeMs,
          inputUsed: result.metadata.inputUsed,
          rolloutId: result.metadata.rolloutId,
          attemptId: result.metadata.attemptId,
          stepsExecuted: result.metadata.stepsExecuted,
          spanCount: result.spans?.length ?? 0,
        }
      );

      // Update only the affected lineage
      set((state) => ({
        lineages: state.lineages.map((l) =>
          l.id === lineageId
            ? {
                ...l,
                currentArtifact: artifact,
                currentEvaluation: null,
                cycle: nextCycle,
              }
            : l
        ),
        isRegenerating: false,
      }));
    } catch (e) {
      set({ error: (e as Error).message, isRegenerating: false });
    }
  },
}));
