/**
 * Tool Execution Engine
 *
 * This module provides the complete tool execution infrastructure:
 * - Tool Registry: Central registration and lookup of tool implementations
 * - Built-in Tools: Simulated tools for MVP (web_search, format_markdown, etc.)
 * - Tool Executor: Executes tools with permission checking and span creation
 *
 * Usage:
 *
 * ```typescript
 * import { toolRegistry, executeToolCalls, parseToolCalls } from './services/tools';
 *
 * // Tools are automatically registered on import
 *
 * // Parse tool calls from LLM response
 * const toolCalls = parseToolCalls(llmResponse);
 *
 * // Execute the tool calls
 * const results = await executeToolCalls(toolCalls, {
 *   agent,
 *   attemptId,
 *   createSpans: true,
 * });
 *
 * // Format results for sending back to LLM
 * const formattedResults = formatToolResultsForLLM(results, 'claude');
 * ```
 */

// Re-export registry types and singleton
export {
  toolRegistry,
  ToolRegistryClass,
  type ToolResult,
  type ToolExecutionParams,
  type ToolImplementation,
} from './registry';

// Re-export executor types and functions
export {
  executeToolCall,
  executeToolCalls,
  executeToolCallsParallel,
  parseToolCalls,
  formatToolResultsForLLM,
  type ToolCall,
  type ToolCallResult,
  type ExecuteToolCallsOptions,
} from './executor';

// Re-export builtin tools for testing/customization
export {
  builtinTools,
  webSearchTool,
  formatMarkdownTool,
  analyzeDataTool,
  brainstormTool,
  calculateTool,
  summarizeTool,
  registerBuiltinTools,
} from './builtin';

// Auto-register built-in tools on module load
import { registerBuiltinTools } from './builtin';
registerBuiltinTools();
