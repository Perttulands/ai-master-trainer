/**
 * Agent Executor Service
 *
 * Executes agents against test inputs to produce artifacts.
 * This is the core service that makes agents actually "run" rather than
 * just storing their configurations.
 *
 * Now supports:
 * - Flow-based execution for agents with defined flows
 * - Single prompt fallback for simple agents
 * - Full execution span tracking for credit assignment
 */

import type { AgentDefinition } from '../types/agent';
import type { ExecutionSpan, Attempt } from '../types/evolution';
import { generateWithSystem } from '../api/llm';
import { executeFlow, type FlowExecutionResult } from './flow';
import { createRollout, createAttempt, updateRollout } from '../db/queries';
import { generateId } from '../utils/id';
import {
  recordAttemptCompleted,
  recordAttemptFailed,
} from './training-signal/recorder';

export interface ExecutionInput {
  /** The test input/prompt to run the agent against */
  content: string;
  /** Optional context from session documents */
  context?: string;
}

export interface ExecutionResult {
  /** The agent's output */
  output: string;
  /** Whether execution succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Metadata about the execution */
  metadata: {
    agentId: string;
    agentVersion: number;
    inputUsed: string;
    executionTimeMs: number;
    model?: string;
    /** Rollout ID for tracking */
    rolloutId?: string;
    /** Attempt ID for tracking */
    attemptId?: string;
    /** Number of steps executed (for flow-based agents) */
    stepsExecuted?: number;
  };
  /** Execution spans for credit assignment (trajectory mode) */
  spans?: ExecutionSpan[];
}

/**
 * Options for agent execution
 */
export interface ExecutionOptions {
  /** Lineage ID for rollout tracking */
  lineageId?: string;
  /** Session ID for debug logging */
  sessionId?: string;
  /** Cycle number for rollout tracking */
  cycle?: number;
  /** Whether to create database records for tracking */
  createRecords?: boolean;
  /** Maximum steps for flow execution */
  maxSteps?: number;
}

/**
 * Execute an agent against a test input
 *
 * This function now supports:
 * - Flow-based execution: If the agent has a defined flow, it uses the flow executor
 * - Single prompt fallback: For agents without flows, uses direct LLM call
 * - Full span tracking: Records execution spans for trajectory-based credit assignment
 */
export async function executeAgent(
  agent: AgentDefinition,
  input: ExecutionInput,
  options: ExecutionOptions = {}
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const { lineageId, sessionId, cycle = 1, createRecords = false, maxSteps } = options;

  // Create rollout and attempt records if tracking is enabled
  let rolloutId: string | undefined;
  let attemptId: string | undefined;

  if (createRecords && lineageId) {
    try {
      const rollout = createRollout({
        lineageId,
        cycle,
      });
      rolloutId = rollout.id;

      const attempt = createAttempt({
        rolloutId,
        attemptNumber: 1,
        agentSnapshot: {
          agentId: agent.id,
          version: agent.version,
          systemPromptHash: hashString(agent.systemPrompt),
          toolsHash: agent.tools ? hashString(JSON.stringify(agent.tools)) : '',
          flowHash: agent.flow ? hashString(JSON.stringify(agent.flow)) : '',
        },
        input: input.content,
        modelId: agent.parameters?.model ?? 'unknown',
        parameters: {
          temperature: agent.parameters?.temperature ?? 0.7,
          maxTokens: agent.parameters?.maxTokens ?? 2048,
          topP: agent.parameters?.topP,
        },
      });
      attemptId = attempt.id;
    } catch (error) {
      console.warn('[Agent Executor] Failed to create tracking records:', error);
      // Continue without tracking - non-critical
    }
  } else {
    // Generate IDs even without database records for flow executor
    attemptId = generateId();
  }

  try {
    let result: FlowExecutionResult;

    // Check if agent has a flow defined
    if (agent.flow && agent.flow.length > 0) {
      // Use flow-based execution
      result = await executeFlow(agent, input.content, attemptId!, {
        sessionContext: input.context,
        maxSteps,
        createSpans: createRecords,
        sessionId,
      });
    } else {
      // Fall back to single prompt execution
      result = await executeSinglePromptDirect(agent, input, attemptId!, sessionId);
    }

    const executionTimeMs = Date.now() - startTime;

    // Update rollout status if tracking
    if (createRecords && rolloutId) {
      try {
        updateRollout(rolloutId, {
          status: result.success ? 'completed' : 'failed',
        });
      } catch {
        // Ignore update errors
      }
    }

    // Record training signal for successful attempt
    if (attemptId && result.success) {
      try {
        const attemptForRecording: Attempt = {
          id: attemptId,
          rolloutId: rolloutId || '',
          attemptNumber: 1,
          status: 'succeeded',
          agentSnapshot: {
            agentId: agent.id,
            version: agent.version,
            systemPromptHash: hashString(agent.systemPrompt),
            toolsHash: agent.tools ? hashString(JSON.stringify(agent.tools)) : '',
            flowHash: agent.flow ? hashString(JSON.stringify(agent.flow)) : '',
          },
          input: input.content,
          modelId: agent.parameters?.model ?? 'unknown',
          parameters: {
            temperature: agent.parameters?.temperature ?? 0.7,
            maxTokens: agent.parameters?.maxTokens ?? 2048,
            topP: agent.parameters?.topP,
          },
          durationMs: executionTimeMs,
          spans: result.spans || [],
          createdAt: Date.now(),
        };
        recordAttemptCompleted(attemptForRecording, result.spans || [], result.output);
      } catch (recordError) {
        console.warn('[Agent Executor] Failed to record training signal:', recordError);
      }
    }

    return {
      output: result.output,
      success: result.success,
      error: result.error,
      metadata: {
        agentId: agent.id,
        agentVersion: agent.version,
        inputUsed: input.content,
        executionTimeMs,
        model: agent.parameters?.model,
        rolloutId,
        attemptId,
        stepsExecuted: result.stepsExecuted,
      },
      spans: result.spans,
    };
  } catch (error) {
    const executionTimeMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Update rollout status if tracking
    if (createRecords && rolloutId) {
      try {
        updateRollout(rolloutId, {
          status: 'failed',
        });
      } catch {
        // Ignore update errors
      }
    }

    // Record training signal for failed attempt
    if (attemptId) {
      try {
        const attemptForRecording: Attempt = {
          id: attemptId,
          rolloutId: rolloutId || '',
          attemptNumber: 1,
          status: 'failed',
          agentSnapshot: {
            agentId: agent.id,
            version: agent.version,
            systemPromptHash: hashString(agent.systemPrompt),
            toolsHash: agent.tools ? hashString(JSON.stringify(agent.tools)) : '',
            flowHash: agent.flow ? hashString(JSON.stringify(agent.flow)) : '',
          },
          input: input.content,
          modelId: agent.parameters?.model ?? 'unknown',
          parameters: {
            temperature: agent.parameters?.temperature ?? 0.7,
            maxTokens: agent.parameters?.maxTokens ?? 2048,
            topP: agent.parameters?.topP,
          },
          durationMs: executionTimeMs,
          spans: [],
          createdAt: Date.now(),
        };
        recordAttemptFailed(attemptForRecording, errorMessage);
      } catch (recordError) {
        console.warn('[Agent Executor] Failed to record training signal:', recordError);
      }
    }

    return {
      output: '',
      success: false,
      error: errorMessage,
      metadata: {
        agentId: agent.id,
        agentVersion: agent.version,
        inputUsed: input.content,
        executionTimeMs,
        rolloutId,
        attemptId,
      },
    };
  }
}

/**
 * Execute a single prompt directly (without flow executor)
 * Used for agents without defined flows
 */
async function executeSinglePromptDirect(
  agent: AgentDefinition,
  input: ExecutionInput,
  attemptId: string,
  sessionId?: string
): Promise<FlowExecutionResult> {
  const startTime = Date.now();

  try {
    // Build the full prompt with agent's system prompt and user input
    const systemPrompt = agent.systemPrompt;

    // Add context if provided
    let userMessage = input.content;
    if (input.context) {
      userMessage = `Context:\n${input.context}\n\n---\n\nTask:\n${input.content}`;
    }

    // Execute using LLM
    const output = await generateWithSystem(systemPrompt, userMessage, {
      temperature: agent.parameters?.temperature ?? 0.7,
      maxTokens: agent.parameters?.maxTokens ?? 2048,
      model: agent.parameters?.model,
      sessionId,
    });

    const durationMs = Date.now() - startTime;

    // Create a span for the LLM call
    const span: ExecutionSpan = {
      id: generateId(),
      attemptId,
      sequence: 0,
      type: 'llm_call',
      input: userMessage,
      output,
      modelId: agent.parameters?.model,
      durationMs,
      createdAt: Date.now(),
    };

    return {
      success: true,
      output,
      spans: [span],
      durationMs,
      stepsExecuted: 1,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return {
      success: false,
      output: '',
      spans: [],
      error: errorMessage,
      durationMs,
      stepsExecuted: 1,
    };
  }
}

/**
 * Simple string hash for deduplication
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

/**
 * Generate a test input for agent execution
 *
 * @param need - The session need (what kind of agent is being trained)
 * @param inputPrompt - Optional explicit input prompt (the actual task/query for agents)
 * @returns ExecutionInput to pass to agents
 */
export function generateDefaultTestInput(need: string, inputPrompt?: string | null): ExecutionInput {
  // If an explicit input prompt is provided, use it directly
  if (inputPrompt) {
    return {
      content: inputPrompt,
    };
  }

  // Fallback: wrap the need in a generic request (legacy behavior)
  return {
    content: `Please demonstrate your capabilities by responding to this request:\n\n${need}\n\nProvide a complete, high-quality response that showcases your approach.`,
  };
}

/**
 * Execute agent - LLM must be configured
 *
 * This is an alias for executeAgent that explicitly requires LLM to be configured.
 * Previously this function had fallback behavior that generated simulated content,
 * but that has been removed to ensure all outputs are real.
 *
 * @throws Error if LLM is not configured or execution fails
 */
export async function executeAgentWithFallback(
  agent: AgentDefinition,
  input: ExecutionInput,
  options: ExecutionOptions = {}
): Promise<ExecutionResult> {
  // No fallback - let errors propagate so callers know execution failed
  return executeAgent(agent, input, options);
}
