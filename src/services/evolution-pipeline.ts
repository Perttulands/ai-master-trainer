/**
 * Evolution Pipeline Service
 *
 * Orchestrates the full Agent Lightning evolution pipeline:
 * 1. Analyze reward (score + comment)
 * 2. Assign credit to agent components
 * 3. Plan evolution changes
 * 4. Apply changes to create new agent version
 * 5. Record evolution for learning
 */

import type { AgentDefinition } from "../types/agent";
import type {
  ScoreAnalysis,
  EvolutionPlan,
  EvolutionRecord,
  ExecutionSpan,
  CreateEvolutionRecordInput,
} from "../types/evolution";
import { analyzeReward, summarizeAnalysis } from "./reward-analyzer";
import { assignCredit, summarizeCreditAssignment } from "./credit-assignment";
import { createEvolutionPlan, summarizePlan } from "./evolution-planner";
import { evolveAgent as applyEvolution } from "./agent-evolver";
import {
  createEvolutionRecord,
  getEvolutionRecordsByLineage,
  updateEvolutionOutcome,
  getLearningInsightsBySession,
  createLearningInsight,
  findInsightByPattern,
  updateLearningInsight,
} from "../db/queries";
import { generateId } from "../utils/id";
import {
  recordAgentEvolved,
  recordEvolutionOutcome,
} from "./training-signal/recorder";

/**
 * Input for the evolution pipeline
 */
export interface EvolutionPipelineInput {
  agent: AgentDefinition;
  need: string;
  score: number;
  comment?: string;
  stickyDirective?: string[];
  oneshotDirective?: string[];
  previousScore?: number;
  rolloutId?: string;
  attemptId?: string;
  spans?: ExecutionSpan[];
  sessionId: string;
}

/**
 * Result of the evolution pipeline
 */
export interface EvolutionPipelineResult {
  evolvedAgent: AgentDefinition;
  evolutionRecord: EvolutionRecord;
  analysis: ScoreAnalysis;
  plan: EvolutionPlan;
  summary: string;
}

/**
 * Runs the full evolution pipeline
 */
export async function runEvolutionPipeline(
  input: EvolutionPipelineInput
): Promise<EvolutionPipelineResult> {
  const {
    agent,
    need,
    score,
    comment,
    stickyDirective,
    oneshotDirective,
    previousScore,
    rolloutId,
    attemptId,
    spans = [],
    sessionId,
  } = input;

  console.log(
    `[Evolution Pipeline] Starting for agent ${agent.name} v${agent.version}`
  );
  console.log(
    `[Evolution Pipeline] Score: ${score}/10, Previous: ${previousScore ?? "N/A"}`
  );

  // Step 1: Analyze Reward
  console.log("[Evolution Pipeline] Step 1: Analyzing reward...");
  const analysis = await analyzeReward(score, comment, previousScore ?? null);
  console.log(`[Evolution Pipeline] ${summarizeAnalysis(analysis)}`);

  // Step 2: Assign Credit
  console.log("[Evolution Pipeline] Step 2: Assigning credit...");
  const { mode, credits } = await assignCredit(agent, analysis, spans);
  console.log(
    `[Evolution Pipeline] Credit mode: ${mode}, ${summarizeCreditAssignment(credits)}`
  );

  // Step 3: Get History for Context
  console.log("[Evolution Pipeline] Step 3: Getting evolution history...");
  const agentLineageId = agent.lineageId || `lineage-${agent.id}`;
  const pastRecords = getEvolutionRecordsByLineage(agentLineageId);
  const insights = getLearningInsightsBySession(sessionId);
  console.log(
    `[Evolution Pipeline] Found ${pastRecords.length} past evolutions, ${insights.length} insights`
  );

  // Step 4: Plan Evolution
  console.log("[Evolution Pipeline] Step 4: Planning evolution...");
  const plan = await createEvolutionPlan(
    agent,
    analysis,
    credits,
    pastRecords,
    insights
  );
  console.log(`[Evolution Pipeline] ${summarizePlan(plan)}`);

  // Step 5: Apply Evolution
  console.log("[Evolution Pipeline] Step 5: Applying evolution...");
  const evolvedAgent = await applyEvolution(
    agent,
    need,
    score,
    comment ?? null,
    stickyDirective ?? null,
    oneshotDirective ?? null
  );

  // Apply additional changes from the plan that weren't handled by basic evolution
  const finalAgent = applyPlanChanges(evolvedAgent, plan);
  console.log(`[Evolution Pipeline] Created agent v${finalAgent.version}`);

  // Step 6: Record Evolution
  console.log("[Evolution Pipeline] Step 6: Recording evolution...");
  const lineageId = agent.lineageId || `lineage-${agent.id}`;
  const recordInput: CreateEvolutionRecordInput = {
    lineageId,
    fromVersion: agent.version,
    toVersion: finalAgent.version,
    rolloutId: rolloutId || generateId(),
    attemptId: attemptId || generateId(),
    triggerScore: score,
    triggerComment: comment,
    triggerDirectives: {
      sticky: stickyDirective,
      oneshot: oneshotDirective,
    },
    scoreAnalysis: analysis,
    creditAssignment: credits,
    plan,
    changes: plan.changes,
  };

  const evolutionRecord = createEvolutionRecord(recordInput);
  console.log(`[Evolution Pipeline] Recorded evolution ${evolutionRecord.id}`);

  // Record training signal for agent evolution
  try {
    recordAgentEvolved(agent, finalAgent, plan.changes, plan.hypothesis, sessionId);
  } catch (recordError) {
    console.warn(
      "[Evolution Pipeline] Failed to record agent evolved:",
      recordError
    );
  }

  // Step 7: Update previous evolution outcome if exists
  if (pastRecords.length > 0) {
    const previousRecord = pastRecords[0]; // Most recent
    if (!previousRecord.outcome) {
      const scoreDelta = score - previousRecord.trigger.score;
      const hypothesisValidated = score > previousRecord.trigger.score;

      updateEvolutionOutcome(previousRecord.id, {
        nextScore: score,
        scoreDelta,
        hypothesisValidated,
      });
      console.log(
        `[Evolution Pipeline] Updated outcome for previous evolution ${previousRecord.id}`
      );

      // Record training signal for evolution outcome
      try {
        recordEvolutionOutcome(
          previousRecord.id,
          scoreDelta,
          hypothesisValidated,
          sessionId
        );
      } catch (recordError) {
        console.warn(
          "[Evolution Pipeline] Failed to record evolution outcome:",
          recordError
        );
      }

      // Extract learning from the outcome
      await extractLearning(previousRecord, score, sessionId);
    }
  }

  // Generate summary
  const summary = generatePipelineSummary(analysis, plan, agent, finalAgent);

  return {
    evolvedAgent: finalAgent,
    evolutionRecord,
    analysis,
    plan,
    summary,
  };
}

/**
 * Applies plan changes to the evolved agent
 */
function applyPlanChanges(
  agent: AgentDefinition,
  plan: EvolutionPlan
): AgentDefinition {
  let modified = { ...agent };

  for (const change of plan.changes) {
    switch (change.component) {
      case "systemPrompt":
        if (change.changeType === "add" && change.after) {
          // Add new instruction if not already present
          if (!modified.systemPrompt.includes(change.after)) {
            modified.systemPrompt = `${modified.systemPrompt}\n\n${change.after}`;
          }
        } else if (change.changeType === "remove" && change.before) {
          // Remove problematic segment
          modified.systemPrompt = modified.systemPrompt.replace(
            change.before,
            ""
          );
        } else if (
          change.changeType === "modify" &&
          change.before &&
          change.after
        ) {
          // Replace segment
          modified.systemPrompt = modified.systemPrompt.replace(
            change.before,
            change.after
          );
        }
        break;

      case "parameters":
        if (change.target === "temperature" && change.after) {
          modified = {
            ...modified,
            parameters: {
              ...modified.parameters,
              temperature: parseFloat(change.after),
            },
          };
        } else if (change.target === "maxTokens" && change.after) {
          modified = {
            ...modified,
            parameters: {
              ...modified.parameters,
              maxTokens: parseInt(change.after, 10),
            },
          };
        }
        break;

      // Tools and flow changes are handled separately
      case "tools":
      case "flow":
        // These require more complex handling - for now, log and skip
        console.log(
          `[Evolution Pipeline] ${change.component} change planned but not applied: ${change.reason}`
        );
        break;
    }
  }

  // Clean up system prompt (remove multiple newlines)
  modified.systemPrompt = modified.systemPrompt
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return modified;
}

/**
 * Extracts learning insights from completed evolution
 */
async function extractLearning(
  record: EvolutionRecord,
  actualScore: number,
  sessionId: string
): Promise<void> {
  const scoreDelta = actualScore - record.trigger.score;
  const wasSuccessful = scoreDelta > 0;

  for (const change of record.changes) {
    // Create a pattern description
    const pattern = `${change.changeType} ${change.component}: ${change.target}`;

    // Check if this pattern already exists
    const insight = findInsightByPattern(sessionId, pattern);

    if (insight) {
      // Update existing insight
      const newSuccessCount = insight.successCount + (wasSuccessful ? 1 : 0);
      const newFailureCount = insight.failureCount + (wasSuccessful ? 0 : 1);
      const totalCount = newSuccessCount + newFailureCount;
      const newAvgImpact =
        (insight.avgScoreImpact * (totalCount - 1) + scoreDelta) / totalCount;
      const newConfidence = Math.min(
        1,
        (totalCount / 10) * (newSuccessCount / totalCount)
      );

      updateLearningInsight(insight.id, {
        successCount: newSuccessCount,
        failureCount: newFailureCount,
        avgScoreImpact: newAvgImpact,
        confidence: newConfidence,
        contexts: [
          ...insight.contexts,
          record.trigger.comment || "no comment",
        ].slice(-10), // Keep last 10 contexts
      });
    } else {
      // Create new insight
      createLearningInsight({
        sessionId,
        pattern,
        patternType: `${change.component}_change` as
          | "prompt_change"
          | "tool_change"
          | "param_change",
        contexts: record.trigger.comment ? [record.trigger.comment] : [],
      });

      // Immediately update with first result
      const newInsight = findInsightByPattern(sessionId, pattern);
      if (newInsight) {
        updateLearningInsight(newInsight.id, {
          successCount: wasSuccessful ? 1 : 0,
          failureCount: wasSuccessful ? 0 : 1,
          avgScoreImpact: scoreDelta,
          confidence: 0.1,
        });
      }
    }
  }
}

/**
 * Generates a human-readable summary of the pipeline run
 */
function generatePipelineSummary(
  analysis: ScoreAnalysis,
  plan: EvolutionPlan,
  oldAgent: AgentDefinition,
  newAgent: AgentDefinition
): string {
  const parts: string[] = [];

  // Score and trend
  parts.push(`Score: ${analysis.score}/10`);
  if (analysis.deltaFromPrevious !== 0) {
    const direction = analysis.deltaFromPrevious > 0 ? "up" : "down";
    parts.push(
      `(${direction} ${Math.abs(analysis.deltaFromPrevious)} from previous)`
    );
  }

  // Key aspects
  if (analysis.aspects.length > 0) {
    const issues = analysis.aspects
      .filter((a) => a.sentiment === "negative")
      .map((a) => a.aspect);
    if (issues.length > 0) {
      parts.push(`Issues: ${issues.join(", ")}`);
    }
  }

  // Changes made
  if (plan.changes.length > 0) {
    parts.push(`Changes: ${plan.changes.length}`);
    for (const change of plan.changes.slice(0, 3)) {
      parts.push(`- ${change.changeType} ${change.component}/${change.target}`);
    }
    if (plan.changes.length > 3) {
      parts.push(`  ...and ${plan.changes.length - 3} more`);
    }
  } else {
    parts.push("No significant changes needed");
  }

  // Version update
  parts.push(`Version: ${oldAgent.version} -> ${newAgent.version}`);

  // Hypothesis
  if (plan.hypothesis) {
    parts.push(`Hypothesis: ${plan.hypothesis}`);
  }

  return parts.join("\n");
}

/**
 * Quick evolution without full pipeline (for simple cases)
 */
export async function quickEvolve(
  agent: AgentDefinition,
  need: string,
  score: number,
  feedback?: string
): Promise<AgentDefinition> {
  return applyEvolution(agent, need, score, feedback ?? null, null, null);
}

/**
 * Gets evolution statistics for a lineage
 */
export function getEvolutionStats(lineageId: string): {
  totalEvolutions: number;
  avgScoreImprovement: number;
  successRate: number;
  commonChanges: string[];
} {
  const records = getEvolutionRecordsByLineage(lineageId);

  if (records.length === 0) {
    return {
      totalEvolutions: 0,
      avgScoreImprovement: 0,
      successRate: 0,
      commonChanges: [],
    };
  }

  // Calculate metrics
  const recordsWithOutcome = records.filter((r) => r.outcome);
  const improvements = recordsWithOutcome.filter(
    (r) => r.outcome!.scoreDelta > 0
  );
  const totalDelta = recordsWithOutcome.reduce(
    (sum, r) => sum + r.outcome!.scoreDelta,
    0
  );

  // Count change types
  const changeCounts = new Map<string, number>();
  for (const record of records) {
    for (const change of record.changes) {
      const key = `${change.component}/${change.target}`;
      changeCounts.set(key, (changeCounts.get(key) || 0) + 1);
    }
  }

  const commonChanges = Array.from(changeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key]) => key);

  return {
    totalEvolutions: records.length,
    avgScoreImprovement:
      recordsWithOutcome.length > 0
        ? totalDelta / recordsWithOutcome.length
        : 0,
    successRate:
      recordsWithOutcome.length > 0
        ? improvements.length / recordsWithOutcome.length
        : 0,
    commonChanges,
  };
}
