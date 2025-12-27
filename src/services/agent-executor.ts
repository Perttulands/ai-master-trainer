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
  const { lineageId, cycle = 1, createRecords = false, maxSteps } = options;

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
      });
    } else {
      // Fall back to single prompt execution
      result = await executeSinglePromptDirect(agent, input, attemptId!);
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
  attemptId: string
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
 * Generate a default test input based on the session need
 */
export function generateDefaultTestInput(need: string): ExecutionInput {
  return {
    content: `Please demonstrate your capabilities by responding to this request:\n\n${need}\n\nProvide a complete, high-quality response that showcases your approach.`,
  };
}

/**
 * Execute agent with fallback for when LLM is unavailable
 */
export async function executeAgentWithFallback(
  agent: AgentDefinition,
  input: ExecutionInput,
  options: ExecutionOptions = {}
): Promise<ExecutionResult> {
  try {
    return await executeAgent(agent, input, options);
  } catch {
    // Fallback: generate a simulated output based on agent config
    const startTime = Date.now();
    const simulatedOutput = generateSimulatedOutput(agent, input);

    return {
      output: simulatedOutput,
      success: true,
      metadata: {
        agentId: agent.id,
        agentVersion: agent.version,
        inputUsed: input.content,
        executionTimeMs: Date.now() - startTime,
        model: 'simulated',
      },
    };
  }
}

/**
 * Generate a simulated output when LLM is unavailable
 * This creates a realistic-looking output based on the agent's configuration
 */
function generateSimulatedOutput(agent: AgentDefinition, input: ExecutionInput): string {
  const style = agent.name.toLowerCase();

  if (style.includes('concise')) {
    return `**Summary**\n\nBased on your request: "${input.content.slice(0, 100)}..."\n\nKey points:\n- Point 1: Direct response to your need\n- Point 2: Actionable next steps\n- Point 3: Clear conclusion\n\n*Generated by ${agent.name} v${agent.version}*`;
  }

  if (style.includes('detailed') || style.includes('comprehensive')) {
    return `# Detailed Analysis\n\n## Overview\nThis response addresses: "${input.content.slice(0, 100)}..."\n\n## Analysis\nProviding comprehensive coverage of the topic with supporting details and context.\n\n## Recommendations\n1. First recommendation with rationale\n2. Second recommendation with implementation steps\n3. Third recommendation with expected outcomes\n\n## Conclusion\nSummary of key findings and suggested next steps.\n\n*Generated by ${agent.name} v${agent.version}*`;
  }

  if (style.includes('creative') || style.includes('interactive')) {
    return `## Creative Response\n\n🎯 **Your Request**: "${input.content.slice(0, 100)}..."\n\n### My Approach\nI've taken a creative angle on this, considering multiple perspectives and possibilities.\n\n### Ideas\n- **Idea 1**: An innovative approach\n- **Idea 2**: A unique perspective\n- **Idea 3**: An unexpected solution\n\n### What's Next?\nLet me know which direction resonates with you!\n\n*Generated by ${agent.name} v${agent.version}*`;
  }

  if (style.includes('analytical')) {
    return `## Analytical Assessment\n\n**Input Analysis**: "${input.content.slice(0, 100)}..."\n\n### Data Points\n| Factor | Assessment | Priority |\n|--------|------------|----------|\n| Factor 1 | High | Critical |\n| Factor 2 | Medium | Important |\n| Factor 3 | Low | Monitor |\n\n### Conclusions\nBased on systematic analysis, the recommended approach is...\n\n*Generated by ${agent.name} v${agent.version}*`;
  }

  // Default output
  return `## Response\n\nAddressing: "${input.content.slice(0, 100)}..."\n\nThis is the agent's response to your request, demonstrating the ${agent.name} approach.\n\n### Key Points\n1. First point\n2. Second point\n3. Third point\n\n*Generated by ${agent.name} v${agent.version}*`;
}
