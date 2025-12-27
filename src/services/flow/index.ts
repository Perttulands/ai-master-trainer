/**
 * Flow Execution Engine
 *
 * This module provides the flow execution engine for agent definitions.
 * Agents can define multi-step flows with conditions, loops, tool calls,
 * and LLM prompts. This engine executes those flows and provides full
 * observability through execution spans.
 *
 * Usage:
 * ```typescript
 * import { executeFlow, validateFlow } from './services/flow';
 *
 * // Execute an agent's flow
 * const result = await executeFlow(agent, input, attemptId, {
 *   sessionContext: 'Optional context',
 *   maxSteps: 50,
 * });
 *
 * if (result.success) {
 *   console.log('Output:', result.output);
 *   console.log('Steps executed:', result.stepsExecuted);
 * } else {
 *   console.error('Error:', result.error);
 * }
 *
 * // Validate a flow before execution
 * const validation = validateFlow(agent.flow);
 * if (!validation.valid) {
 *   console.error('Flow errors:', validation.errors);
 * }
 * ```
 */

// Core execution
export {
  executeFlow,
  executeSinglePrompt,
  executeFlowWithRetry,
  validateFlow,
  type FlowExecutionResult,
  type FlowExecutionOptions,
} from './executor';

// Flow builders
export {
  createSimpleFlow,
  createToolFlow,
} from './executor';

// Step handlers and utilities
export {
  stepHandlers,
  interpolate,
  evaluateCondition,
  getNextStep,
  buildStepMap,
  findStartStep,
  createFlowContext,
  type FlowContext,
  type StepResult,
  type StepHandler,
} from './handlers';
