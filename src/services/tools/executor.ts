/**
 * Tool Executor
 *
 * Executes tool calls from LLM responses, validating against agent
 * permissions and creating execution spans for observability.
 */

import { toolRegistry, type ToolResult } from './registry';
import { createSpan } from '../../db/queries';
import { generateId } from '../../utils/id';
import type { AgentDefinition } from '../../types/agent';

/**
 * A tool call as received from an LLM response
 * Matches the format used by Claude and other LLMs
 */
export interface ToolCall {
  /** Unique identifier for the tool call */
  id: string;
  /** The name of the tool to execute */
  name: string;
  /** Arguments to pass to the tool */
  arguments: Record<string, unknown>;
}

/**
 * Result of executing a single tool call
 */
export interface ToolCallResult {
  /** The original tool call */
  toolCall: ToolCall;
  /** The result from the tool */
  result: ToolResult;
  /** The execution span ID (if created) */
  spanId?: string;
  /** Whether the tool was allowed for this agent */
  allowed: boolean;
}

/**
 * Options for tool execution
 */
export interface ExecuteToolCallsOptions {
  /** The agent executing the tools (for permission checking) */
  agent?: AgentDefinition;
  /** The attempt ID (for creating spans) */
  attemptId?: string;
  /** Parent span ID (for nested tool calls) */
  parentSpanId?: string;
  /** Starting sequence number for spans */
  startSequence?: number;
  /** Whether to create spans in the database */
  createSpans?: boolean;
  /** Context to pass to tools */
  context?: {
    agentId?: string;
    sessionId?: string;
  };
}

/**
 * Validate that a tool call is allowed for the given agent
 */
function isToolAllowed(toolName: string, agent?: AgentDefinition): boolean {
  if (!agent) {
    // No agent specified, allow all registered tools
    return toolRegistry.has(toolName);
  }

  // Check if tool is in agent's allowed tools list
  if (agent.constraints?.allowedTools) {
    if (!agent.constraints.allowedTools.includes(toolName)) {
      return false;
    }
  }

  // Check if tool is defined in agent's tools array
  const agentTool = agent.tools.find((t) => {
    if (t.type === 'builtin' && t.config.builtinName === toolName) {
      return true;
    }
    return t.name === toolName;
  });

  // Tool must be defined in agent's tools or in allowedTools constraint
  return !!agentTool || (agent.constraints?.allowedTools?.includes(toolName) ?? false);
}


/**
 * Execute a single tool call
 */
export async function executeToolCall(
  toolCall: ToolCall,
  options: ExecuteToolCallsOptions = {}
): Promise<ToolCallResult> {
  const { agent, attemptId, parentSpanId, createSpans = true, context } = options;
  const startTime = Date.now();

  // Check if tool is allowed
  const allowed = isToolAllowed(toolCall.name, agent);

  if (!allowed) {
    const result: ToolResult = {
      success: false,
      output: null,
      error: `Tool "${toolCall.name}" is not allowed for this agent`,
      metadata: {
        executionTimeMs: Date.now() - startTime,
      },
    };

    // Create span for rejected tool call if we have an attempt ID
    let spanId: string | undefined;
    if (createSpans && attemptId) {
      const span = createSpan({
        attemptId,
        parentSpanId,
        sequence: options.startSequence ?? 0,
        type: 'tool_call',
        input: JSON.stringify({ name: toolCall.name, arguments: toolCall.arguments }),
        output: JSON.stringify(result),
        toolName: toolCall.name,
        toolArgs: toolCall.arguments,
        toolError: result.error,
        durationMs: Date.now() - startTime,
      });
      spanId = span.id;
    }

    return {
      toolCall,
      result,
      spanId,
      allowed: false,
    };
  }

  // Check if tool is registered
  if (!toolRegistry.has(toolCall.name)) {
    const result: ToolResult = {
      success: false,
      output: null,
      error: `Tool "${toolCall.name}" is not registered in the tool registry`,
      metadata: {
        executionTimeMs: Date.now() - startTime,
      },
    };

    let spanId: string | undefined;
    if (createSpans && attemptId) {
      const span = createSpan({
        attemptId,
        parentSpanId,
        sequence: options.startSequence ?? 0,
        type: 'tool_call',
        input: JSON.stringify({ name: toolCall.name, arguments: toolCall.arguments }),
        output: JSON.stringify(result),
        toolName: toolCall.name,
        toolArgs: toolCall.arguments,
        toolError: result.error,
        durationMs: Date.now() - startTime,
      });
      spanId = span.id;
    }

    return {
      toolCall,
      result,
      spanId,
      allowed: true,
    };
  }

  // Execute the tool
  const result = await toolRegistry.execute(toolCall.name, {
    args: toolCall.arguments,
    context: {
      agentId: context?.agentId ?? agent?.id,
      attemptId,
      sessionId: context?.sessionId,
    },
  });

  // Create execution span
  let spanId: string | undefined;
  if (createSpans && attemptId) {
    const span = createSpan({
      attemptId,
      parentSpanId,
      sequence: options.startSequence ?? 0,
      type: 'tool_call',
      input: JSON.stringify({ name: toolCall.name, arguments: toolCall.arguments }),
      output: JSON.stringify(result.output),
      toolName: toolCall.name,
      toolArgs: toolCall.arguments,
      toolResult: result.output,
      toolError: result.error,
      durationMs: result.metadata?.executionTimeMs ?? (Date.now() - startTime),
    });
    spanId = span.id;
  }

  return {
    toolCall,
    result,
    spanId,
    allowed: true,
  };
}

/**
 * Execute multiple tool calls
 * Returns results in the same order as the input tool calls
 */
export async function executeToolCalls(
  toolCalls: ToolCall[],
  options: ExecuteToolCallsOptions = {}
): Promise<ToolCallResult[]> {
  const results: ToolCallResult[] = [];
  let sequence = options.startSequence ?? 0;

  for (const toolCall of toolCalls) {
    const result = await executeToolCall(toolCall, {
      ...options,
      startSequence: sequence,
    });
    results.push(result);
    sequence++;
  }

  return results;
}

/**
 * Execute tool calls in parallel
 * Faster but spans may not have sequential sequence numbers
 */
export async function executeToolCallsParallel(
  toolCalls: ToolCall[],
  options: ExecuteToolCallsOptions = {}
): Promise<ToolCallResult[]> {
  const startSequence = options.startSequence ?? 0;

  const promises = toolCalls.map((toolCall, index) =>
    executeToolCall(toolCall, {
      ...options,
      startSequence: startSequence + index,
    })
  );

  return Promise.all(promises);
}

/**
 * Convert LLM tool use response to ToolCall array
 * Handles different LLM response formats
 */
export function parseToolCalls(
  response: unknown
): ToolCall[] {
  // Handle Claude/Anthropic format
  if (isClaudeToolUseResponse(response)) {
    return response.content
      .filter((block): block is ClaudeToolUseBlock => block.type === 'tool_use')
      .map((block) => ({
        id: block.id,
        name: block.name,
        arguments: block.input,
      }));
  }

  // Handle OpenAI format
  if (isOpenAIToolCallResponse(response)) {
    return response.tool_calls.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: typeof tc.function.arguments === 'string'
        ? JSON.parse(tc.function.arguments)
        : tc.function.arguments,
    }));
  }

  // Handle array of tool calls directly
  if (Array.isArray(response)) {
    return response.map((tc) => ({
      id: tc.id || generateId(),
      name: tc.name || tc.function?.name,
      arguments: tc.arguments || tc.input || tc.function?.arguments || {},
    }));
  }

  return [];
}

// Type guards for different LLM response formats

interface ClaudeToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface ClaudeToolUseResponse {
  content: Array<{ type: string } & Partial<ClaudeToolUseBlock>>;
}

function isClaudeToolUseResponse(response: unknown): response is ClaudeToolUseResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'content' in response &&
    Array.isArray((response as ClaudeToolUseResponse).content)
  );
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string | Record<string, unknown>;
  };
}

interface OpenAIToolCallResponse {
  tool_calls: OpenAIToolCall[];
}

function isOpenAIToolCallResponse(response: unknown): response is OpenAIToolCallResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'tool_calls' in response &&
    Array.isArray((response as OpenAIToolCallResponse).tool_calls)
  );
}

/**
 * Format tool results for sending back to the LLM
 */
export function formatToolResultsForLLM(
  results: ToolCallResult[],
  format: 'claude' | 'openai' = 'claude'
): unknown {
  if (format === 'claude') {
    return results.map((r) => ({
      type: 'tool_result',
      tool_use_id: r.toolCall.id,
      content: r.result.success
        ? JSON.stringify(r.result.output)
        : `Error: ${r.result.error}`,
      is_error: !r.result.success,
    }));
  }

  // OpenAI format
  return results.map((r) => ({
    role: 'tool',
    tool_call_id: r.toolCall.id,
    content: r.result.success
      ? JSON.stringify(r.result.output)
      : `Error: ${r.result.error}`,
  }));
}
