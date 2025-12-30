/**
 * Flow Step Handlers
 *
 * Implements handlers for each step type in the agent flow:
 * - start: Initialize context with input
 * - prompt: Call LLM with template interpolation
 * - tool: Execute tool via tool executor
 * - condition: Evaluate condition and branch
 * - loop: Handle loop iteration
 * - output: Terminal step, finalize output
 */

import type { AgentDefinition, AgentFlowStep } from "../../types/agent";
import type { ExecutionSpan } from "../../types/evolution";
import { executeToolCall, type ToolCall } from "../tools/executor";
import { generateWithSystem, generateText } from "../../api/llm";
import { createSpan } from "../../db/queries";
import { safeEvaluateCondition } from "../../utils/safeExpressionEvaluator";

/**
 * Context maintained during flow execution
 */
export interface FlowContext {
  /** The agent being executed */
  agent: AgentDefinition;
  /** The original input to the flow */
  input: string;
  /** Optional context from session */
  sessionContext?: string;
  /** Session ID for debug logging */
  sessionId?: string;
  /** The attempt ID for span tracking */
  attemptId: string;
  /** Variables accumulated during execution */
  variables: Record<string, unknown>;
  /** Current sequence number for spans */
  sequence: number;
  /** Parent span ID for nesting */
  parentSpanId?: string;
  /** Spans created during execution */
  spans: ExecutionSpan[];
  /** Loop state tracking */
  loopState: Map<string, LoopState>;
  /** Whether to persist spans to the database */
  createSpans: boolean;
}

/**
 * State for tracking loop execution
 */
interface LoopState {
  /** Current iteration index */
  currentIndex: number;
  /** Maximum iterations allowed */
  maxIterations: number;
  /** Items to iterate over (if forEach) */
  items?: unknown[];
  /** Variable name for current item */
  itemVariable?: string;
}

/**
 * Result from executing a single step
 */
export interface StepResult {
  /** Output from this step */
  output: unknown;
  /** The next step ID to execute (null for terminal) */
  nextStepId: string | null;
  /** Updated sequence number */
  sequence: number;
  /** Whether the step succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Handler function type for step execution
 */
export type StepHandler = (
  step: AgentFlowStep,
  context: FlowContext
) => Promise<StepResult>;

/**
 * Registry of step handlers by type
 */
export const stepHandlers: Record<AgentFlowStep["type"], StepHandler> = {
  start: handleStartStep,
  prompt: handlePromptStep,
  tool: handleToolStep,
  condition: handleConditionStep,
  loop: handleLoopStep,
  output: handleOutputStep,
};

/**
 * Handle start step - Initialize context with input
 */
async function handleStartStep(
  step: AgentFlowStep,
  context: FlowContext
): Promise<StepResult> {
  const startTime = Date.now();

  // Initialize variables with input
  context.variables["input"] = context.input;
  context.variables["sessionContext"] = context.sessionContext || "";

  // Handle any initial variable assignments from config
  const initialVars = step.config.variables as
    | Record<string, unknown>
    | undefined;
  if (initialVars) {
    Object.assign(context.variables, initialVars);
  }

  // Create span for start step
  const span = createSpan(
    {
      attemptId: context.attemptId,
      parentSpanId: context.parentSpanId,
      sequence: context.sequence,
      type: "reasoning",
      input: JSON.stringify({ step: "start", input: context.input }),
      output: JSON.stringify({ variables: Object.keys(context.variables) }),
      durationMs: Date.now() - startTime,
    },
    context.createSpans
  );
  context.spans.push(span);

  return {
    output: context.input,
    nextStepId: step.connections.next || null,
    sequence: context.sequence + 1,
    success: true,
  };
}

/**
 * Handle prompt step - Call LLM with template interpolation
 */
async function handlePromptStep(
  step: AgentFlowStep,
  context: FlowContext
): Promise<StepResult> {
  const startTime = Date.now();

  try {
    // Get template from config
    const template = step.config.template as string | undefined;
    const useSystemPrompt = step.config.useSystemPrompt as boolean | undefined;
    const outputVariable = step.config.outputVariable as string | undefined;

    // Warn if template doesn't reference input (may ignore user input)
    if (
      template &&
      !template.includes("{{input}}") &&
      !template.includes("{{")
    ) {
      console.warn(
        `[Flow] Prompt step "${step.name}" has static template that may ignore user input`
      );
    }

    // Build the prompt with interpolation
    let prompt: string;
    if (template) {
      prompt = interpolate(template, context.variables);
    } else {
      // Default: use the current input value
      prompt = String(context.variables["input"] || context.input);
    }

    // Execute LLM call
    let output: string;
    if (useSystemPrompt !== false && context.agent.systemPrompt) {
      output = await generateWithSystem(context.agent.systemPrompt, prompt, {
        temperature: context.agent.parameters?.temperature ?? 0.7,
        maxTokens: context.agent.parameters?.maxTokens ?? 2048,
        model: context.agent.parameters?.model,
        sessionId: context.sessionId,
      });
    } else {
      output = await generateText(prompt, {
        temperature: context.agent.parameters?.temperature ?? 0.7,
        maxTokens: context.agent.parameters?.maxTokens ?? 2048,
        model: context.agent.parameters?.model,
        sessionId: context.sessionId,
      });
    }

    // Store output in variable
    const varName = outputVariable || "lastOutput";
    context.variables[varName] = output;
    context.variables["lastOutput"] = output;

    // Create span for LLM call
    const span = createSpan(
      {
        attemptId: context.attemptId,
        parentSpanId: context.parentSpanId,
        sequence: context.sequence,
        type: "llm_call",
        input: prompt,
        output: output,
        modelId: context.agent.parameters?.model,
        durationMs: Date.now() - startTime,
      },
      context.createSpans
    );
    context.spans.push(span);

    return {
      output,
      nextStepId: step.connections.next || null,
      sequence: context.sequence + 1,
      success: true,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Create span for failed LLM call
    const span = createSpan(
      {
        attemptId: context.attemptId,
        parentSpanId: context.parentSpanId,
        sequence: context.sequence,
        type: "llm_call",
        input: JSON.stringify(step.config),
        output: "",
        durationMs: Date.now() - startTime,
      },
      context.createSpans
    );
    context.spans.push(span);

    // Check if there's an error handler
    if (step.connections.onError) {
      context.variables["error"] = errorMessage;
      return {
        output: null,
        nextStepId: step.connections.onError,
        sequence: context.sequence + 1,
        success: false,
        error: errorMessage,
      };
    }

    return {
      output: null,
      nextStepId: null,
      sequence: context.sequence + 1,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Handle tool step - Execute tool via tool executor
 *
 * Supports multiple config formats for backwards compatibility:
 * - args: { key: value } - direct arguments
 * - parameters: { key: value } - alias for args
 * - inputMapping: "{{variable}}" - single input from variable
 */
async function handleToolStep(
  step: AgentFlowStep,
  context: FlowContext
): Promise<StepResult> {
  const startTime = Date.now();

  try {
    // Get tool configuration
    const toolName = step.config.toolName as string;
    const outputVariable = step.config.outputVariable as string | undefined;

    if (!toolName) {
      throw new Error("Tool step requires toolName in config");
    }

    // Support multiple arg formats: args, parameters, or inputMapping
    let toolArgs: Record<string, unknown> | undefined;

    if (step.config.args) {
      // Primary format: args object
      toolArgs = step.config.args as Record<string, unknown>;
    } else if (step.config.parameters) {
      // Alternative format: parameters object (used by flowLayout demo)
      toolArgs = step.config.parameters as Record<string, unknown>;
    } else if (step.config.inputMapping) {
      // Template format: inputMapping string (used by flow-templates)
      // Interpolate and use as the 'input' argument
      const mappedValue = interpolate(
        step.config.inputMapping as string,
        context.variables
      );
      toolArgs = { input: mappedValue };
    }

    // Interpolate any template strings in args
    const interpolatedArgs: Record<string, unknown> = {};
    if (toolArgs) {
      for (const [key, value] of Object.entries(toolArgs)) {
        if (typeof value === "string") {
          interpolatedArgs[key] = interpolate(value, context.variables);
        } else {
          interpolatedArgs[key] = value;
        }
      }
    }

    // Create tool call
    const toolCall: ToolCall = {
      id: `${step.id}-${context.sequence}`,
      name: toolName,
      arguments: interpolatedArgs,
    };

    // Execute tool
    const result = await executeToolCall(toolCall, {
      agent: context.agent,
      attemptId: context.attemptId,
      parentSpanId: context.parentSpanId,
      startSequence: context.sequence,
      createSpans: context.createSpans,
      context: {
        agentId: context.agent.id,
      },
    });

    // Add span to context if created
    if (result.span) {
      context.spans.push(result.span);
    }

    // Store result in variable
    const varName = outputVariable || "lastToolResult";
    context.variables[varName] = result.result.output;
    context.variables["lastToolResult"] = result.result.output;
    context.variables["lastToolSuccess"] = result.result.success;

    if (!result.result.success) {
      context.variables["error"] = result.result.error;

      // Check if there's an error handler
      if (step.connections.onError) {
        return {
          output: result.result.output,
          nextStepId: step.connections.onError,
          sequence: context.sequence + 1,
          success: false,
          error: result.result.error,
        };
      }
    }

    return {
      output: result.result.output,
      nextStepId: step.connections.next || null,
      sequence: context.sequence + 1,
      success: result.result.success,
      error: result.result.error,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Create span for failed tool call
    const span = createSpan(
      {
        attemptId: context.attemptId,
        parentSpanId: context.parentSpanId,
        sequence: context.sequence,
        type: "tool_call",
        input: JSON.stringify(step.config),
        output: "",
        toolName: step.config.toolName as string,
        toolError: errorMessage,
        durationMs: Date.now() - startTime,
      },
      context.createSpans
    );
    context.spans.push(span);

    // Check if there's an error handler
    if (step.connections.onError) {
      context.variables["error"] = errorMessage;
      return {
        output: null,
        nextStepId: step.connections.onError,
        sequence: context.sequence + 1,
        success: false,
        error: errorMessage,
      };
    }

    return {
      output: null,
      nextStepId: null,
      sequence: context.sequence + 1,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Handle condition step - Evaluate condition and branch
 */
async function handleConditionStep(
  step: AgentFlowStep,
  context: FlowContext
): Promise<StepResult> {
  const startTime = Date.now();

  try {
    // Get condition from config
    const condition = step.config.condition as string;

    if (!condition) {
      throw new Error("Condition step requires condition in config");
    }

    // Evaluate the condition
    const result = evaluateCondition(condition, context.variables);

    // Create span for condition evaluation
    const span = createSpan(
      {
        attemptId: context.attemptId,
        parentSpanId: context.parentSpanId,
        sequence: context.sequence,
        type: "reasoning",
        input: JSON.stringify({
          condition,
          variables: Object.keys(context.variables),
        }),
        output: JSON.stringify({ result }),
        durationMs: Date.now() - startTime,
      },
      context.createSpans
    );
    context.spans.push(span);

    // Branch based on result
    const nextStepId = result
      ? step.connections.onTrue
      : step.connections.onFalse;

    return {
      output: result,
      nextStepId: nextStepId || null,
      sequence: context.sequence + 1,
      success: true,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Create span for failed condition
    const span = createSpan(
      {
        attemptId: context.attemptId,
        parentSpanId: context.parentSpanId,
        sequence: context.sequence,
        type: "reasoning",
        input: JSON.stringify(step.config),
        output: JSON.stringify({ error: errorMessage }),
        durationMs: Date.now() - startTime,
      },
      context.createSpans
    );
    context.spans.push(span);

    // On error, try onFalse path or error handler
    if (step.connections.onError) {
      context.variables["error"] = errorMessage;
      return {
        output: false,
        nextStepId: step.connections.onError,
        sequence: context.sequence + 1,
        success: false,
        error: errorMessage,
      };
    }

    return {
      output: false,
      nextStepId: step.connections.onFalse || null,
      sequence: context.sequence + 1,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Handle loop step - Handle loop iteration
 */
async function handleLoopStep(
  step: AgentFlowStep,
  context: FlowContext
): Promise<StepResult> {
  const startTime = Date.now();

  // Get or initialize loop state
  let loopState = context.loopState.get(step.id);

  if (!loopState) {
    // Initialize new loop
    const maxIterations = (step.config.maxIterations as number) || 10;
    const itemsVariable = step.config.itemsVariable as string | undefined;
    const itemVariable = step.config.itemVariable as string | undefined;

    let items: unknown[] | undefined;
    if (itemsVariable && context.variables[itemsVariable]) {
      const value = context.variables[itemsVariable];
      items = Array.isArray(value) ? value : [value];
    }

    loopState = {
      currentIndex: 0,
      maxIterations: items ? items.length : maxIterations,
      items,
      itemVariable: itemVariable || "item",
    };
    context.loopState.set(step.id, loopState);
  }

  // Check if we should continue the loop
  const shouldContinue = loopState.currentIndex < loopState.maxIterations;

  if (shouldContinue) {
    // Set current item variable if iterating over items
    if (loopState.items && loopState.itemVariable) {
      context.variables[loopState.itemVariable] =
        loopState.items[loopState.currentIndex];
    }
    context.variables["loopIndex"] = loopState.currentIndex;

    // Increment for next iteration
    loopState.currentIndex++;

    // Create span for loop iteration
    const span = createSpan(
      {
        attemptId: context.attemptId,
        parentSpanId: context.parentSpanId,
        sequence: context.sequence,
        type: "reasoning",
        input: JSON.stringify({
          step: "loop",
          iteration: loopState.currentIndex - 1,
        }),
        output: JSON.stringify({ continuing: true }),
        durationMs: Date.now() - startTime,
      },
      context.createSpans
    );
    context.spans.push(span);

    // Continue to loop body (onTrue)
    return {
      output: loopState.currentIndex - 1,
      nextStepId: step.connections.onTrue || step.connections.next || null,
      sequence: context.sequence + 1,
      success: true,
    };
  } else {
    // Loop complete, clean up state
    context.loopState.delete(step.id);

    // Create span for loop completion
    const span = createSpan(
      {
        attemptId: context.attemptId,
        parentSpanId: context.parentSpanId,
        sequence: context.sequence,
        type: "reasoning",
        input: JSON.stringify({
          step: "loop",
          totalIterations: loopState.currentIndex,
        }),
        output: JSON.stringify({ continuing: false, completed: true }),
        durationMs: Date.now() - startTime,
      },
      context.createSpans
    );
    context.spans.push(span);

    // Exit loop (onFalse or next)
    return {
      output: loopState.currentIndex,
      nextStepId: step.connections.onFalse || step.connections.next || null,
      sequence: context.sequence + 1,
      success: true,
    };
  }
}

/**
 * Handle output step - Terminal step, finalize output
 */
async function handleOutputStep(
  step: AgentFlowStep,
  context: FlowContext
): Promise<StepResult> {
  const startTime = Date.now();

  // Get output configuration
  const template = step.config.template as string | undefined;
  const variable = step.config.variable as string | undefined;

  let output: unknown;

  if (template) {
    // Use template with interpolation
    output = interpolate(template, context.variables);
  } else if (variable) {
    // Use specific variable
    output = context.variables[variable];
  } else {
    // Default to lastOutput - do NOT fall back to raw input as it may contain
    // internal test prompts like "Please demonstrate your capabilities..."
    output = context.variables["lastOutput"] ?? "";
  }

  // Create span for output step
  const span = createSpan(
    {
      attemptId: context.attemptId,
      parentSpanId: context.parentSpanId,
      sequence: context.sequence,
      type: "output",
      input: JSON.stringify({ template, variable }),
      output: typeof output === "string" ? output : JSON.stringify(output),
      durationMs: Date.now() - startTime,
    },
    context.createSpans
  );
  context.spans.push(span);

  return {
    output,
    nextStepId: null, // Terminal step
    sequence: context.sequence + 1,
    success: true,
  };
}

// ============ Helper Functions ============

/**
 * Interpolate variables into a template string
 * Supports {{variableName}} and {{variableName.property}} syntax
 */
export function interpolate(
  template: string,
  variables: Record<string, unknown>
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const trimmedPath = path.trim();
    const value = getNestedValue(variables, trimmedPath);

    if (value === undefined || value === null) {
      return match; // Keep original if not found
    }

    if (typeof value === "object") {
      return JSON.stringify(value);
    }

    return String(value);
  });
}

/**
 * Get a nested value from an object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Evaluate a condition expression against variables
 * Supports basic comparisons, logical operators, and special patterns.
 *
 * SECURITY: Uses a sandboxed evaluator that blocks access to dangerous
 * globals like window, constructor, __proto__, etc.
 */
export function evaluateCondition(
  condition: string,
  variables: Record<string, unknown>
): boolean {
  // Handle common comparison patterns that need special parsing
  // These patterns are handled first before the general expression evaluator

  // "exists varName" or "varName exists"
  if (/\bexists\b/i.test(condition)) {
    const varMatch = condition.match(/(?:(\w+)\s+)?exists(?:\s+(\w+))?/i);
    if (varMatch) {
      const varName = varMatch[1] || varMatch[2];
      if (varName) {
        const value = getNestedValue(variables, varName);
        return value !== undefined && value !== null;
      }
    }
  }

  // Handle "is empty" / "is not empty" patterns
  if (/\bis\s+empty\b/i.test(condition)) {
    const varMatch = condition.match(/(\w+)\s+is\s+empty/i);
    if (varMatch) {
      const value = getNestedValue(variables, varMatch[1]);
      return isEmpty(value);
    }
  }
  if (/\bis\s+not\s+empty\b/i.test(condition)) {
    const varMatch = condition.match(/(\w+)\s+is\s+not\s+empty/i);
    if (varMatch) {
      const value = getNestedValue(variables, varMatch[1]);
      return !isEmpty(value);
    }
  }

  // Handle "contains" pattern
  if (/\bcontains\b/i.test(condition)) {
    const containsMatch = condition.match(
      /(\w+)\s+contains\s+["']([^"']+)["']/i
    );
    if (containsMatch) {
      const value = getNestedValue(variables, containsMatch[1]);
      const search = containsMatch[2];
      if (typeof value === "string") {
        return value.includes(search);
      }
      if (Array.isArray(value)) {
        return value.includes(search);
      }
      return false;
    }
  }

  // Use the safe expression evaluator for all other expressions
  // This replaces the dangerous `new Function()` call with a sandboxed parser
  return safeEvaluateCondition(condition, variables);
}

/**
 * Check if a value is empty
 */
function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === "string") {
    return value.trim() === "";
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (typeof value === "object") {
    return Object.keys(value).length === 0;
  }
  return false;
}

/**
 * Get the next step from a step's connections
 */
export function getNextStep(
  step: AgentFlowStep,
  stepMap: Map<string, AgentFlowStep>,
  branch?: "next" | "onTrue" | "onFalse" | "onError"
): AgentFlowStep | null {
  const connectionKey = branch || "next";
  const nextStepId = step.connections[connectionKey];

  if (!nextStepId) {
    return null;
  }

  return stepMap.get(nextStepId) || null;
}

/**
 * Build a step lookup map from flow steps array
 */
export function buildStepMap(
  steps: AgentFlowStep[]
): Map<string, AgentFlowStep> {
  const map = new Map<string, AgentFlowStep>();
  for (const step of steps) {
    map.set(step.id, step);
  }
  return map;
}

/**
 * Find the start step in a flow
 */
export function findStartStep(steps: AgentFlowStep[]): AgentFlowStep | null {
  // First, look for a step with type 'start'
  const startStep = steps.find((s) => s.type === "start");
  if (startStep) {
    return startStep;
  }

  // Fallback: return the first step
  return steps.length > 0 ? steps[0] : null;
}

/**
 * Create an initial flow context
 */
export function createFlowContext(
  agent: AgentDefinition,
  input: string,
  attemptId: string,
  options: {
    sessionContext?: string;
    parentSpanId?: string;
    sessionId?: string;
    createSpans?: boolean;
  } = {}
): FlowContext {
  return {
    agent,
    input,
    sessionContext: options.sessionContext,
    sessionId: options.sessionId,
    attemptId,
    variables: {},
    sequence: 0,
    parentSpanId: options.parentSpanId,
    spans: [],
    loopState: new Map(),
    createSpans: options.createSpans ?? true,
  };
}
