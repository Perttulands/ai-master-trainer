import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  executeToolCall,
  executeToolCalls,
  executeToolCallsParallel,
  parseToolCalls,
  formatToolResultsForLLM,
  type ToolCall,
} from "../executor";
import { toolRegistry, type ToolImplementation } from "../registry";
import { createSpan } from "../../../db/queries";
import type { AgentDefinition } from "../../../types/agent";

// Mock the createSpan function from db/queries
vi.mock("../../../db/queries", () => ({
  createSpan: vi.fn(() => ({ id: `span-${Date.now()}-${Math.random()}` })),
}));

// Import the mocked createSpan for assertions
const mockedCreateSpan = createSpan as ReturnType<typeof vi.fn>;

// Helper to create a mock tool
function createMockTool(name: string): ToolImplementation {
  return {
    name,
    description: `Test tool: ${name}`,
    execute: vi.fn().mockResolvedValue({
      success: true,
      output: { data: `Result from ${name}` },
      metadata: { executionTimeMs: 50 },
    }),
  };
}

// Helper to create a test tool call
function createToolCall(
  name: string,
  args: Record<string, unknown> = {}
): ToolCall {
  return {
    id: `call-${name}-${Date.now()}`,
    name,
    arguments: args,
  };
}

// Helper to create a minimal agent definition
function createMockAgent(
  overrides?: Partial<AgentDefinition>
): AgentDefinition {
  return {
    id: "agent-123",
    name: "Test Agent",
    description: "A test agent",
    version: 1,
    systemPrompt: "You are helpful",
    tools: [],
    flow: [],
    memory: { type: "none", config: {} },
    parameters: { model: "test-model", temperature: 0.7, maxTokens: 1024 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("Tool Executor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toolRegistry.clear();
  });

  describe("executeToolCall()", () => {
    it("should execute a valid registered tool", async () => {
      const tool = createMockTool("valid_tool");
      toolRegistry.register(tool);

      const toolCall = createToolCall("valid_tool", { query: "test" });
      const result = await executeToolCall(toolCall, { createSpans: false });

      expect(result.allowed).toBe(true);
      expect(result.result.success).toBe(true);
      expect(result.result.output).toEqual({ data: "Result from valid_tool" });
      expect(tool.execute).toHaveBeenCalledWith({
        args: { query: "test" },
        context: {
          agentId: undefined,
          attemptId: undefined,
          sessionId: undefined,
        },
      });
    });

    it("should return error for unregistered tool", async () => {
      const toolCall = createToolCall("unregistered_tool");
      const result = await executeToolCall(toolCall, { createSpans: false });

      // When no agent is specified, isToolAllowed checks if tool is registered
      // Since it's not registered, allowed is false
      expect(result.allowed).toBe(false);
      expect(result.result.success).toBe(false);
      expect(result.result.error).toContain("not allowed");
    });

    it("should create span when attemptId is provided", async () => {
      const tool = createMockTool("span_tool");
      toolRegistry.register(tool);

      const toolCall = createToolCall("span_tool");
      const result = await executeToolCall(toolCall, {
        attemptId: "attempt-123",
        createSpans: true,
      });

      expect(mockedCreateSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          attemptId: "attempt-123",
          type: "tool_call",
          toolName: "span_tool",
        }),
        true
      );
      expect(result.spanId).toBeDefined();
      expect(result.spanId).toContain("span-");
    });

    it("should not create span when createSpans is false", async () => {
      const tool = createMockTool("no_span_tool");
      toolRegistry.register(tool);

      const toolCall = createToolCall("no_span_tool");
      await executeToolCall(toolCall, {
        attemptId: "attempt-123",
        createSpans: false,
      });

      expect(createSpan).toHaveBeenCalledWith(expect.any(Object), false);
    });

    it("should reject tool not in agent allowedTools constraint", async () => {
      const tool = createMockTool("restricted_tool");
      toolRegistry.register(tool);

      const agent = createMockAgent({
        constraints: {
          allowedTools: ["other_tool"],
        },
      });

      const toolCall = createToolCall("restricted_tool");
      const result = await executeToolCall(toolCall, {
        agent,
        createSpans: false,
      });

      expect(result.allowed).toBe(false);
      expect(result.result.success).toBe(false);
      expect(result.result.error).toContain("not allowed for this agent");
    });

    it("should allow tool in agent allowedTools constraint", async () => {
      const tool = createMockTool("allowed_tool");
      toolRegistry.register(tool);

      const agent = createMockAgent({
        constraints: {
          allowedTools: ["allowed_tool"],
        },
      });

      const toolCall = createToolCall("allowed_tool");
      const result = await executeToolCall(toolCall, {
        agent,
        createSpans: false,
      });

      expect(result.allowed).toBe(true);
      expect(result.result.success).toBe(true);
    });

    it("should allow tool defined in agent tools array", async () => {
      const tool = createMockTool("agent_tool");
      toolRegistry.register(tool);

      const agent = createMockAgent({
        tools: [
          {
            id: "tool-1",
            name: "agent_tool",
            description: "Agent tool",
            type: "builtin",
            config: { builtinName: "agent_tool" },
            parameters: [],
          },
        ],
      });

      const toolCall = createToolCall("agent_tool");
      const result = await executeToolCall(toolCall, {
        agent,
        createSpans: false,
      });

      expect(result.allowed).toBe(true);
    });

    it("should pass context to tool execution", async () => {
      const tool = createMockTool("context_tool");
      toolRegistry.register(tool);

      const toolCall = createToolCall("context_tool");
      await executeToolCall(toolCall, {
        attemptId: "attempt-456",
        context: {
          agentId: "ctx-agent",
          sessionId: "ctx-session",
        },
        createSpans: false,
      });

      expect(tool.execute).toHaveBeenCalledWith({
        args: {},
        context: {
          agentId: "ctx-agent",
          attemptId: "attempt-456",
          sessionId: "ctx-session",
        },
      });
    });
  });

  describe("executeToolCalls()", () => {
    it("should execute multiple tool calls sequentially", async () => {
      const tool1 = createMockTool("seq_tool_1");
      const tool2 = createMockTool("seq_tool_2");
      toolRegistry.register(tool1);
      toolRegistry.register(tool2);

      const toolCalls = [
        createToolCall("seq_tool_1"),
        createToolCall("seq_tool_2"),
      ];

      const results = await executeToolCalls(toolCalls, { createSpans: false });

      expect(results).toHaveLength(2);
      expect(results[0].result.success).toBe(true);
      expect(results[1].result.success).toBe(true);
    });

    it("should return results in same order as input", async () => {
      const tool1 = createMockTool("order_tool_1");
      const tool2 = createMockTool("order_tool_2");
      toolRegistry.register(tool1);
      toolRegistry.register(tool2);

      const toolCalls = [
        createToolCall("order_tool_1"),
        createToolCall("order_tool_2"),
      ];

      const results = await executeToolCalls(toolCalls, { createSpans: false });

      expect(results[0].toolCall.name).toBe("order_tool_1");
      expect(results[1].toolCall.name).toBe("order_tool_2");
    });

    it("should handle empty array", async () => {
      const results = await executeToolCalls([], { createSpans: false });

      expect(results).toEqual([]);
    });

    it("should increment sequence numbers", async () => {
      const tool = createMockTool("sequence_tool");
      toolRegistry.register(tool);

      const toolCalls = [
        createToolCall("sequence_tool"),
        createToolCall("sequence_tool"),
        createToolCall("sequence_tool"),
      ];

      await executeToolCalls(toolCalls, {
        attemptId: "attempt-seq",
        startSequence: 5,
        createSpans: true,
      });

      const calls = mockedCreateSpan.mock.calls;
      expect(calls[0][0].sequence).toBe(5);
      expect(calls[1][0].sequence).toBe(6);
      expect(calls[2][0].sequence).toBe(7);
    });
  });

  describe("executeToolCallsParallel()", () => {
    it("should execute multiple tool calls in parallel", async () => {
      const tool1 = createMockTool("par_tool_1");
      const tool2 = createMockTool("par_tool_2");
      toolRegistry.register(tool1);
      toolRegistry.register(tool2);

      const toolCalls = [
        createToolCall("par_tool_1"),
        createToolCall("par_tool_2"),
      ];

      const results = await executeToolCallsParallel(toolCalls, {
        createSpans: false,
      });

      expect(results).toHaveLength(2);
      expect(results[0].result.success).toBe(true);
      expect(results[1].result.success).toBe(true);
    });

    it("should handle empty array", async () => {
      const results = await executeToolCallsParallel([], {
        createSpans: false,
      });

      expect(results).toEqual([]);
    });
  });

  describe("parseToolCalls()", () => {
    it("should parse Claude/Anthropic format", () => {
      const response = {
        content: [
          { type: "text", text: "Some text" },
          {
            type: "tool_use",
            id: "call-123",
            name: "search",
            input: { query: "test" },
          },
          {
            type: "tool_use",
            id: "call-456",
            name: "analyze",
            input: { data: "sample" },
          },
        ],
      };

      const toolCalls = parseToolCalls(response);

      expect(toolCalls).toHaveLength(2);
      expect(toolCalls[0]).toEqual({
        id: "call-123",
        name: "search",
        arguments: { query: "test" },
      });
      expect(toolCalls[1]).toEqual({
        id: "call-456",
        name: "analyze",
        arguments: { data: "sample" },
      });
    });

    it("should parse OpenAI format with string arguments", () => {
      const response = {
        tool_calls: [
          {
            id: "tc-1",
            type: "function",
            function: {
              name: "get_weather",
              arguments: JSON.stringify({ location: "NYC" }),
            },
          },
        ],
      };

      const toolCalls = parseToolCalls(response);

      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0]).toEqual({
        id: "tc-1",
        name: "get_weather",
        arguments: { location: "NYC" },
      });
    });

    it("should parse OpenAI format with object arguments", () => {
      const response = {
        tool_calls: [
          {
            id: "tc-2",
            type: "function",
            function: {
              name: "search",
              arguments: { query: "hello" },
            },
          },
        ],
      };

      const toolCalls = parseToolCalls(response);

      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0].arguments).toEqual({ query: "hello" });
    });

    it("should parse array format directly", () => {
      const response = [
        { id: "arr-1", name: "tool1", arguments: { a: 1 } },
        { name: "tool2", input: { b: 2 } },
      ];

      const toolCalls = parseToolCalls(response);

      expect(toolCalls).toHaveLength(2);
      expect(toolCalls[0].name).toBe("tool1");
      expect(toolCalls[0].arguments).toEqual({ a: 1 });
      expect(toolCalls[1].name).toBe("tool2");
      expect(toolCalls[1].arguments).toEqual({ b: 2 });
    });

    it("should return empty array for unrecognized format", () => {
      const response = { someOther: "format" };

      const toolCalls = parseToolCalls(response);

      expect(toolCalls).toEqual([]);
    });

    it("should return empty array for null/undefined", () => {
      expect(parseToolCalls(null)).toEqual([]);
      expect(parseToolCalls(undefined)).toEqual([]);
    });
  });

  describe("formatToolResultsForLLM()", () => {
    const mockResults = [
      {
        toolCall: { id: "call-1", name: "tool1", arguments: {} },
        result: { success: true, output: { data: "success" } },
        allowed: true,
      },
      {
        toolCall: { id: "call-2", name: "tool2", arguments: {} },
        result: { success: false, output: null, error: "Something went wrong" },
        allowed: true,
      },
    ];

    it("should format results for Claude format", () => {
      const formatted = formatToolResultsForLLM(
        mockResults,
        "claude"
      ) as Array<{
        type: string;
        tool_use_id: string;
        content: string;
        is_error: boolean;
      }>;

      expect(formatted).toHaveLength(2);
      expect(formatted[0]).toEqual({
        type: "tool_result",
        tool_use_id: "call-1",
        content: JSON.stringify({ data: "success" }),
        is_error: false,
      });
      expect(formatted[1]).toEqual({
        type: "tool_result",
        tool_use_id: "call-2",
        content: "Error: Something went wrong",
        is_error: true,
      });
    });

    it("should format results for OpenAI format", () => {
      const formatted = formatToolResultsForLLM(
        mockResults,
        "openai"
      ) as Array<{
        role: string;
        tool_call_id: string;
        content: string;
      }>;

      expect(formatted).toHaveLength(2);
      expect(formatted[0]).toEqual({
        role: "tool",
        tool_call_id: "call-1",
        content: JSON.stringify({ data: "success" }),
      });
      expect(formatted[1]).toEqual({
        role: "tool",
        tool_call_id: "call-2",
        content: "Error: Something went wrong",
      });
    });

    it("should default to Claude format", () => {
      const formatted = formatToolResultsForLLM(mockResults) as Array<{
        type: string;
      }>;

      expect(formatted[0].type).toBe("tool_result");
    });
  });
});
