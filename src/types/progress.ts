/**
 * Progress Tracking Types
 *
 * Types for tracking multi-step operations with real-time progress feedback.
 */

export type OperationType =
  | "session_creation"
  | "regeneration"
  | "single_run"
  | "add_agent";

export type ProgressStage =
  // Session creation stages
  | "generating_agents" // Creating agent definitions via LLM
  | "executing_agents" // Running agents to produce artifacts
  // Regeneration/evolution stages
  | "analyzing_reward" // Step 1: Parse score/comment
  | "assigning_credit" // Step 2: Blame prompt segments
  | "getting_history" // Step 3: Load evolution history
  | "planning_evolution" // Step 4: Generate changes
  | "applying_evolution" // Step 5: Apply changes to agent
  | "recording_evolution" // Step 6: Save evolution record
  | "executing_evolved" // Final: Execute evolved agent
  | "complete";

export interface ProgressItem {
  id: string; // Lineage ID or agent label
  label: string; // Display label (e.g., "Agent A", "Lineage B")
  stage: ProgressStage;
  status: "pending" | "in_progress" | "completed" | "error";
  error?: string;
}

export interface OperationProgress {
  id: string;
  type: OperationType;
  totalItems: number;
  completedItems: number;
  currentStage: ProgressStage;
  stageLabel: string; // Human-readable stage description
  items: ProgressItem[];
  startedAt: number;
  error?: string;
}

/**
 * Progress emitter interface for passing to async operations
 */
export interface ProgressEmitter {
  /** Update the current operation stage */
  stage: (stage: ProgressStage, label: string) => void;
  /** Mark an item as in progress with its current stage */
  itemProgress: (itemId: string, stage: ProgressStage) => void;
  /** Mark an item as completed */
  itemComplete: (itemId: string) => void;
  /** Mark an item as failed with error message */
  itemError: (itemId: string, error: string) => void;
}

/**
 * Human-readable labels for each progress stage
 */
export const STAGE_LABELS: Record<ProgressStage, string> = {
  generating_agents: "Creating agent configurations...",
  executing_agents: "Running agents to produce outputs...",
  analyzing_reward: "Analyzing your feedback...",
  assigning_credit: "Identifying areas to improve...",
  getting_history: "Reviewing evolution history...",
  planning_evolution: "Planning improvements...",
  applying_evolution: "Applying changes to agent...",
  recording_evolution: "Saving evolution record...",
  executing_evolved: "Testing evolved agent...",
  complete: "Complete",
};
