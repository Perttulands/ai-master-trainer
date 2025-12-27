/**
 * Flow Execution Engine
 *
 * Executes agent flows by following step connections and executing
 * each step type with the appropriate handler. Provides full
 * observability through execution spans.
 */

import type { AgentDefinition, AgentFlowStep } from '../../types/agent';
import type { ExecutionSpan } from '../../types/evolution';
import { generateWithSystem } from '../../api/llm';
import { createSpan, updateAttempt } from '../../db/queries';
import {
  stepHandlers,
  buildStepMap,
  findStartStep,
  createFlowContext,
  type StepHandler,
} from './handlers';

/**
 * Result of executing a complete flow
 */
export interface FlowExecutionResult {
  /** Whether the flow completed successfully */
  success: boolean;
  /** The final output from the flow */
  output: string;
  /** All execution spans created during the flow */
  spans: ExecutionSpan[];
  /** Error message if the flow failed */
  error?: string;
  /** Total execution time in milliseconds */
  durationMs: number;
  /** Number of steps executed */
  stepsExecuted: number;
  /** Final variables state */
  variables?: Record<string, unknown>;
}

/**
 * Options for flow execution
 */
export interface FlowExecutionOptions {
  /** Maximum number of steps to execute (prevents infinite loops) */
  maxSteps?: number;
  /** Optional session context to include */
  sessionContext?: string;
  /** Whether to create spans in the database */
  createSpans?: boolean;
  /** Parent span ID for nesting */
  parentSpanId?: string;
}

/** Default maximum steps to prevent infinite loops */
const DEFAULT_MAX_STEPS = 100;

/**
 * Execute a complete agent flow
 *
 * This is the main entry point for flow execution. It handles:
 * - Building the step map
 * - Finding the start step
 * - Executing steps in order following connections
 * - Recording spans for observability
 * - Handling max steps limit
 * - Falling back to single prompt if no flow defined
 */
export async function executeFlow(
  agent: AgentDefinition,
  input: string,
  attemptId: string,
  options: FlowExecutionOptions = {}
): Promise<FlowExecutionResult> {
  const startTime = Date.now();
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;

  // Check if agent has a valid flow
  if (!agent.flow || agent.flow.length === 0) {
    // Fall back to single prompt execution
    return executeSinglePrompt(agent, input, attemptId, options);
  }

  // Build step lookup map
  const stepMap = buildStepMap(agent.flow);

  // Find start step
  const startStep = findStartStep(agent.flow);
  if (!startStep) {
    return {
      success: false,
      output: '',
      spans: [],
      error: 'No start step found in flow',
      durationMs: Date.now() - startTime,
      stepsExecuted: 0,
    };
  }

  // Create execution context
  const context = createFlowContext(agent, input, attemptId, {
    sessionContext: options.sessionContext,
    parentSpanId: options.parentSpanId,
  });

  // Execute flow
  let currentStep: AgentFlowStep | null = startStep;
  let stepsExecuted = 0;
  let lastOutput: unknown = input;
  let lastError: string | undefined;

  while (currentStep !== null && stepsExecuted < maxSteps) {
    stepsExecuted++;

    // Get handler for this step type
    const handler: StepHandler | undefined = stepHandlers[currentStep.type];
    if (!handler) {
      lastError = `Unknown step type: ${currentStep.type}`;
      break;
    }

    // Capture current step for error handling
    const stepToExecute = currentStep;

    try {
      // Execute the step
      const result = await handler(stepToExecute, context);

      // Update context sequence
      context.sequence = result.sequence;

      // Track output
      if (result.output !== null && result.output !== undefined) {
        lastOutput = result.output;
      }

      // Check for errors
      if (!result.success && result.error) {
        lastError = result.error;
        // If nextStepId is null and we have an error, stop execution
        if (result.nextStepId === null) {
          break;
        }
      }

      // Move to next step
      if (result.nextStepId === null) {
        // Flow complete
        currentStep = null;
      } else {
        currentStep = stepMap.get(result.nextStepId) || null;
        if (!currentStep && result.nextStepId) {
          lastError = `Step not found: ${result.nextStepId}`;
          break;
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown execution error';

      // Try to find error handler
      if (stepToExecute.connections.onError) {
        const errorStep = stepMap.get(stepToExecute.connections.onError);
        if (errorStep) {
          context.variables['error'] = lastError;
          currentStep = errorStep;
          continue;
        }
      }

      // No error handler, stop execution
      break;
    }
  }

  // Check if we hit the max steps limit
  if (stepsExecuted >= maxSteps && currentStep !== null) {
    lastError = `Flow exceeded maximum steps limit (${maxSteps})`;
  }

  // Determine final output
  const finalOutput = formatOutput(lastOutput);

  // Calculate duration
  const durationMs = Date.now() - startTime;

  // Update attempt if we have spans
  if (context.spans.length > 0) {
    try {
      updateAttempt(attemptId, {
        output: finalOutput,
        status: lastError && currentStep === null ? 'failed' : 'succeeded',
        error: lastError,
        durationMs,
      });
    } catch {
      // Ignore update errors
    }
  }

  return {
    success: !lastError || currentStep === null,
    output: finalOutput,
    spans: context.spans,
    error: lastError,
    durationMs,
    stepsExecuted,
    variables: context.variables,
  };
}

/**
 * Execute a single prompt (fallback when no flow is defined)
 *
 * This provides backward compatibility with agents that don't have
 * a flow defined, executing a simple system prompt + user input call.
 */
export async function executeSinglePrompt(
  agent: AgentDefinition,
  input: string,
  attemptId: string,
  options: FlowExecutionOptions = {}
): Promise<FlowExecutionResult> {
  const startTime = Date.now();

  try {
    // Build the user message with optional context
    let userMessage = input;
    if (options.sessionContext) {
      userMessage = `Context:\n${options.sessionContext}\n\n---\n\nTask:\n${input}`;
    }

    // Execute LLM call
    const output = await generateWithSystem(
      agent.systemPrompt,
      userMessage,
      {
        temperature: agent.parameters?.temperature ?? 0.7,
        maxTokens: agent.parameters?.maxTokens ?? 2048,
        model: agent.parameters?.model,
      }
    );

    const durationMs = Date.now() - startTime;

    // Create span for the LLM call
    const spans: ExecutionSpan[] = [];
    if (options.createSpans !== false) {
      const span = createSpan({
        attemptId,
        parentSpanId: options.parentSpanId,
        sequence: 0,
        type: 'llm_call',
        input: userMessage,
        output: output,
        modelId: agent.parameters?.model,
        durationMs,
      });
      spans.push(span);
    }

    // Update attempt
    try {
      updateAttempt(attemptId, {
        output,
        status: 'succeeded',
        durationMs,
      });
    } catch {
      // Ignore update errors
    }

    return {
      success: true,
      output,
      spans,
      durationMs,
      stepsExecuted: 1,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Create span for failed call
    const spans: ExecutionSpan[] = [];
    if (options.createSpans !== false) {
      const span = createSpan({
        attemptId,
        parentSpanId: options.parentSpanId,
        sequence: 0,
        type: 'llm_call',
        input: input,
        output: '',
        modelId: agent.parameters?.model,
        durationMs,
      });
      spans.push(span);
    }

    // Update attempt
    try {
      updateAttempt(attemptId, {
        output: '',
        status: 'failed',
        error: errorMessage,
        durationMs,
      });
    } catch {
      // Ignore update errors
    }

    return {
      success: false,
      output: '',
      spans,
      error: errorMessage,
      durationMs,
      stepsExecuted: 1,
    };
  }
}

/**
 * Validate a flow for common issues
 */
export function validateFlow(steps: AgentFlowStep[]): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const stepMap = buildStepMap(steps);

  // Check for start step
  const startStep = findStartStep(steps);
  if (!startStep) {
    errors.push('Flow must have a start step');
  }

  // Check for output step
  const hasOutput = steps.some((s) => s.type === 'output');
  if (!hasOutput) {
    warnings.push('Flow has no output step - may not return a result');
  }

  // Check all connections are valid
  for (const step of steps) {
    const connections = step.connections;
    if (connections.next && !stepMap.has(connections.next)) {
      errors.push(`Step "${step.name}" has invalid next connection: ${connections.next}`);
    }
    if (connections.onTrue && !stepMap.has(connections.onTrue)) {
      errors.push(`Step "${step.name}" has invalid onTrue connection: ${connections.onTrue}`);
    }
    if (connections.onFalse && !stepMap.has(connections.onFalse)) {
      errors.push(`Step "${step.name}" has invalid onFalse connection: ${connections.onFalse}`);
    }
    if (connections.onError && !stepMap.has(connections.onError)) {
      errors.push(`Step "${step.name}" has invalid onError connection: ${connections.onError}`);
    }

    // Type-specific validation
    if (step.type === 'condition' && !connections.onTrue && !connections.onFalse) {
      warnings.push(`Condition step "${step.name}" has no branch connections`);
    }
    if (step.type === 'loop' && !connections.onTrue) {
      warnings.push(`Loop step "${step.name}" has no body connection (onTrue)`);
    }
    if (step.type === 'tool' && !step.config.toolName) {
      errors.push(`Tool step "${step.name}" has no toolName configured`);
    }
  }

  // Check for unreachable steps
  const reachable = new Set<string>();
  if (startStep) {
    collectReachableSteps(startStep, stepMap, reachable);
  }
  for (const step of steps) {
    if (!reachable.has(step.id) && step.type !== 'start') {
      warnings.push(`Step "${step.name}" is unreachable`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Collect all reachable steps from a starting step
 */
function collectReachableSteps(
  step: AgentFlowStep,
  stepMap: Map<string, AgentFlowStep>,
  visited: Set<string>
): void {
  if (visited.has(step.id)) {
    return;
  }
  visited.add(step.id);

  const connections = [
    step.connections.next,
    step.connections.onTrue,
    step.connections.onFalse,
    step.connections.onError,
  ];

  for (const conn of connections) {
    if (conn) {
      const nextStep = stepMap.get(conn);
      if (nextStep) {
        collectReachableSteps(nextStep, stepMap, visited);
      }
    }
  }
}

/**
 * Format an output value to a string
 */
function formatOutput(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * Execute a flow with retry capability
 */
export async function executeFlowWithRetry(
  agent: AgentDefinition,
  input: string,
  attemptId: string,
  options: FlowExecutionOptions & {
    maxRetries?: number;
    retryDelayMs?: number;
  } = {}
): Promise<FlowExecutionResult> {
  const maxRetries = options.maxRetries ?? 2;
  const retryDelayMs = options.retryDelayMs ?? 1000;

  let lastResult: FlowExecutionResult | null = null;
  let lastError: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Add delay between retries
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }

    try {
      const result = await executeFlow(agent, input, attemptId, options);

      if (result.success) {
        return result;
      }

      lastResult = result;
      lastError = result.error;

      // Don't retry on certain error types
      if (result.error?.includes('maximum steps limit')) {
        break;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error';
    }
  }

  // Return last result or create error result
  if (lastResult) {
    return lastResult;
  }

  return {
    success: false,
    output: '',
    spans: [],
    error: lastError || 'All retries failed',
    durationMs: 0,
    stepsExecuted: 0,
  };
}

/**
 * Create a simple flow for basic prompt execution
 * Useful for creating flows programmatically
 */
export function createSimpleFlow(template?: string): AgentFlowStep[] {
  return [
    {
      id: 'start',
      type: 'start',
      name: 'Start',
      config: {},
      position: { x: 0, y: 0 },
      connections: { next: 'prompt' },
    },
    {
      id: 'prompt',
      type: 'prompt',
      name: 'Generate Response',
      config: {
        template: template || '{{input}}',
        useSystemPrompt: true,
        outputVariable: 'response',
      },
      position: { x: 0, y: 100 },
      connections: { next: 'output' },
    },
    {
      id: 'output',
      type: 'output',
      name: 'Output',
      config: {
        variable: 'response',
      },
      position: { x: 0, y: 200 },
      connections: {},
    },
  ];
}

/**
 * Create a flow with a tool call
 */
export function createToolFlow(
  toolName: string,
  toolArgs: Record<string, string>,
  processPromptTemplate?: string
): AgentFlowStep[] {
  const steps: AgentFlowStep[] = [
    {
      id: 'start',
      type: 'start',
      name: 'Start',
      config: {},
      position: { x: 0, y: 0 },
      connections: { next: 'tool' },
    },
    {
      id: 'tool',
      type: 'tool',
      name: `Execute ${toolName}`,
      config: {
        toolName,
        args: toolArgs,
        outputVariable: 'toolResult',
      },
      position: { x: 0, y: 100 },
      connections: { next: processPromptTemplate ? 'process' : 'output', onError: 'error_output' },
    },
  ];

  if (processPromptTemplate) {
    steps.push({
      id: 'process',
      type: 'prompt',
      name: 'Process Results',
      config: {
        template: processPromptTemplate,
        useSystemPrompt: true,
        outputVariable: 'response',
      },
      position: { x: 0, y: 200 },
      connections: { next: 'output' },
    });
  }

  steps.push({
    id: 'output',
    type: 'output',
    name: 'Output',
    config: {
      variable: processPromptTemplate ? 'response' : 'toolResult',
    },
    position: { x: 0, y: processPromptTemplate ? 300 : 200 },
    connections: {},
  });

  steps.push({
    id: 'error_output',
    type: 'output',
    name: 'Error Output',
    config: {
      template: 'Error executing tool: {{error}}',
    },
    position: { x: 200, y: 200 },
    connections: {},
  });

  return steps;
}
