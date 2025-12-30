import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import type { AgentDefinition, AgentFlowStep } from "../../../types/agent";
import type { FlowContext } from "../handlers";

// Mock the LLM API
vi.mock("../../../api/llm", () => ({
  generateWithSystem: vi.fn(),
  generateText: vi.fn(),
}));

// Mock the tool executor
vi.mock("../../tools/executor", () => ({
  executeToolCall: vi.fn(),
}));

// Mock the database queries
vi.mock("../../../db/queries", () => ({
  createSpan: vi.fn(),
}));

// Import modules (mocks will be in place)
import {
  stepHandlers,
  interpolate,
  evaluateCondition,
  buildStepMap,
  findStartStep,
  getNextStep,
  createFlowContext,
} from "../handlers";
import { generateWithSystem, generateText } from "../../../api/llm";
import { executeToolCall } from "../../tools/executor";
import { createSpan } from "../../../db/queries";

// Cast mocked functions for easier use
const mockGenerateWithSystem = generateWithSystem as Mock;
const mockGenerateText = generateText as Mock;
const mockExecuteToolCall = executeToolCall as Mock;
const mockCreateSpan = createSpan as Mock;

// Helper to create a test agent
function createTestAgent(
  overrides: Partial<AgentDefinition> = {}
): AgentDefinition {
  return {
    id: "agent-123",
    name: "Test Agent",
    description: "A test agent",
    version: 1,
    systemPrompt: "You are a helpful assistant.",
    tools: [],
    flow: [],
    memory: { type: "buffer", config: { maxMessages: 10 } },
    parameters: { model: "claude-sonnet", temperature: 0.7, maxTokens: 1024 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

// Helper to create a test flow step
function createTestStep(overrides: Partial<AgentFlowStep> = {}): AgentFlowStep {
  return {
    id: "step-1",
    type: "start",
    name: "Test Step",
    config: {},
    position: { x: 0, y: 0 },
    connections: {},
    ...overrides,
  };
}

// Helper to create a flow context
function createTestContext(overrides: Partial<FlowContext> = {}): FlowContext {
  return {
    agent: createTestAgent(),
    input: "Test input",
    attemptId: "attempt-123",
    variables: {},
    sequence: 0,
    spans: [],
    loopState: new Map(),
    createSpans: true,
    ...overrides,
  };
}

describe("Flow Step Handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock implementations
    mockGenerateWithSystem.mockResolvedValue("LLM response");
    mockGenerateText.mockResolvedValue("LLM response without system");
    mockExecuteToolCall.mockResolvedValue({
      toolCall: { id: "tool-1", name: "test_tool", arguments: {} },
      result: { success: true, output: "Tool result", metadata: {} },
      spanId: "span-tool-1",
      allowed: true,
    });
    mockCreateSpan.mockImplementation((input) => ({
      id: `span-${Date.now()}-${Math.random()}`,
      attemptId: input.attemptId,
      parentSpanId: input.parentSpanId,
      sequence: input.sequence,
      type: input.type,
      input: input.input,
      output: input.output,
      durationMs: input.durationMs,
      createdAt: Date.now(),
    }));
  });

  describe("stepHandlers registry", () => {
    it("should have handlers for all step types", () => {
      expect(stepHandlers).toHaveProperty("start");
      expect(stepHandlers).toHaveProperty("prompt");
      expect(stepHandlers).toHaveProperty("tool");
      expect(stepHandlers).toHaveProperty("condition");
      expect(stepHandlers).toHaveProperty("loop");
      expect(stepHandlers).toHaveProperty("output");
    });
  });

  describe("start handler", () => {
    it("should return input and next step", async () => {
      const step = createTestStep({
        type: "start",
        connections: { next: "step-2" },
      });
      const context = createTestContext({ input: "Hello world" });

      const result = await stepHandlers.start(step, context);

      expect(result.success).toBe(true);
      expect(result.output).toBe("Hello world");
      expect(result.nextStepId).toBe("step-2");
      expect(result.sequence).toBe(1);
    });

    it("should initialize variables with input", async () => {
      const step = createTestStep({ type: "start" });
      const context = createTestContext({ input: "Test" });

      await stepHandlers.start(step, context);

      expect(context.variables["input"]).toBe("Test");
    });

    it("should set sessionContext in variables if provided", async () => {
      const step = createTestStep({ type: "start" });
      const context = createTestContext({
        input: "Test",
        sessionContext: "Session context here",
      });

      await stepHandlers.start(step, context);

      expect(context.variables["sessionContext"]).toBe("Session context here");
    });

    it("should apply initial variables from config", async () => {
      const step = createTestStep({
        type: "start",
        config: {
          variables: {
            customVar: "custom value",
            anotherVar: 42,
          },
        },
      });
      const context = createTestContext();

      await stepHandlers.start(step, context);

      expect(context.variables["customVar"]).toBe("custom value");
      expect(context.variables["anotherVar"]).toBe(42);
    });

    it("should create a span for the start step", async () => {
      const step = createTestStep({ type: "start" });
      const context = createTestContext();

      await stepHandlers.start(step, context);

      expect(mockCreateSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          attemptId: context.attemptId,
          type: "reasoning",
        }),
        true
      );
      expect(context.spans).toHaveLength(1);
    });

    it("should return null nextStepId if no connection", async () => {
      const step = createTestStep({
        type: "start",
        connections: {},
      });
      const context = createTestContext();

      const result = await stepHandlers.start(step, context);

      expect(result.nextStepId).toBeNull();
    });
  });

  describe("prompt handler", () => {
    it("should call LLM with system prompt and return content", async () => {
      const step = createTestStep({
        type: "prompt",
        config: { template: "{{input}}", useSystemPrompt: true },
        connections: { next: "step-2" },
      });
      const context = createTestContext({ input: "Hello" });
      context.variables["input"] = "Hello";

      const result = await stepHandlers.prompt(step, context);

      expect(mockGenerateWithSystem).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.output).toBe("LLM response");
      expect(result.nextStepId).toBe("step-2");
    });

    it("should use generateText when useSystemPrompt is false", async () => {
      const step = createTestStep({
        type: "prompt",
        config: { template: "{{input}}", useSystemPrompt: false },
      });
      const context = createTestContext({ input: "Hello" });
      context.agent.systemPrompt = "";
      context.variables["input"] = "Hello";

      await stepHandlers.prompt(step, context);

      expect(mockGenerateText).toHaveBeenCalled();
    });

    it("should interpolate template with variables", async () => {
      const step = createTestStep({
        type: "prompt",
        config: { template: "User said: {{input}}" },
      });
      const context = createTestContext({ input: "Hello world" });
      context.variables["input"] = "Hello world";

      await stepHandlers.prompt(step, context);

      expect(mockGenerateWithSystem).toHaveBeenCalledWith(
        expect.any(String),
        "User said: Hello world",
        expect.any(Object)
      );
    });

    it("should store output in specified variable", async () => {
      const step = createTestStep({
        type: "prompt",
        config: { outputVariable: "myOutput" },
      });
      const context = createTestContext();
      context.variables["input"] = "test input";

      await stepHandlers.prompt(step, context);

      expect(context.variables["myOutput"]).toBe("LLM response");
      expect(context.variables["lastOutput"]).toBe("LLM response");
    });

    it("should default outputVariable to lastOutput", async () => {
      const step = createTestStep({
        type: "prompt",
        config: {},
      });
      const context = createTestContext();
      context.variables["input"] = "test input";

      await stepHandlers.prompt(step, context);

      expect(context.variables["lastOutput"]).toBe("LLM response");
    });

    it("should create a span for the LLM call", async () => {
      const step = createTestStep({ type: "prompt" });
      const context = createTestContext();
      context.variables["input"] = "test input";

      await stepHandlers.prompt(step, context);

      expect(mockCreateSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          attemptId: context.attemptId,
          type: "llm_call",
        }),
        true
      );
      expect(context.spans).toHaveLength(1);
    });

    it("should handle LLM errors gracefully", async () => {
      mockGenerateWithSystem.mockRejectedValueOnce(new Error("LLM API Error"));

      const step = createTestStep({
        type: "prompt",
        connections: { onError: "error-handler" },
      });
      const context = createTestContext();
      context.variables["input"] = "test input";

      const result = await stepHandlers.prompt(step, context);

      expect(result.success).toBe(false);
      expect(result.error).toBe("LLM API Error");
      expect(result.nextStepId).toBe("error-handler");
    });

    it("should return null nextStepId on error without error handler", async () => {
      mockGenerateWithSystem.mockRejectedValueOnce(new Error("LLM API Error"));

      const step = createTestStep({
        type: "prompt",
        connections: {},
      });
      const context = createTestContext();
      context.variables["input"] = "test input";

      const result = await stepHandlers.prompt(step, context);

      expect(result.success).toBe(false);
      expect(result.nextStepId).toBeNull();
    });
  });

  describe("tool handler", () => {
    it("should execute tool calls", async () => {
      const step = createTestStep({
        type: "tool",
        config: {
          toolName: "test_tool",
          args: { query: "test" },
        },
        connections: { next: "step-2" },
      });
      const context = createTestContext();

      const result = await stepHandlers.tool(step, context);

      expect(mockExecuteToolCall).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.output).toBe("Tool result");
      expect(result.nextStepId).toBe("step-2");
    });

    it("should interpolate arguments with variables", async () => {
      const step = createTestStep({
        type: "tool",
        config: {
          toolName: "search",
          args: { query: "{{searchTerm}}" },
        },
      });
      const context = createTestContext();
      context.variables["searchTerm"] = "AI agents";

      await stepHandlers.tool(step, context);

      expect(mockExecuteToolCall).toHaveBeenCalledWith(
        expect.objectContaining({
          arguments: { query: "AI agents" },
        }),
        expect.any(Object)
      );
    });

    it("should store tool result in specified variable", async () => {
      const step = createTestStep({
        type: "tool",
        config: {
          toolName: "test_tool",
          outputVariable: "searchResult",
        },
      });
      const context = createTestContext();

      await stepHandlers.tool(step, context);

      expect(context.variables["searchResult"]).toBe("Tool result");
      expect(context.variables["lastToolResult"]).toBe("Tool result");
      expect(context.variables["lastToolSuccess"]).toBe(true);
    });

    it("should throw error if toolName is missing", async () => {
      const step = createTestStep({
        type: "tool",
        config: {},
      });
      const context = createTestContext();

      const result = await stepHandlers.tool(step, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain("toolName");
    });

    it("should handle tool execution errors", async () => {
      mockExecuteToolCall.mockResolvedValueOnce({
        toolCall: { id: "tool-1", name: "test_tool", arguments: {} },
        result: { success: false, output: null, error: "Tool failed" },
        spanId: "span-tool-1",
        allowed: true,
      });

      const step = createTestStep({
        type: "tool",
        config: { toolName: "test_tool" },
        connections: { onError: "error-handler" },
      });
      const context = createTestContext();

      const result = await stepHandlers.tool(step, context);

      expect(result.success).toBe(false);
      expect(result.nextStepId).toBe("error-handler");
      expect(context.variables["error"]).toBe("Tool failed");
    });

    it('should support "parameters" config format (used by flowLayout demo)', async () => {
      const step = createTestStep({
        type: "tool",
        config: {
          toolName: "web_search",
          parameters: { query: "{{input}}" },
        },
        connections: { next: "step-2" },
      });
      const context = createTestContext();
      context.variables["input"] = "test query";

      const result = await stepHandlers.tool(step, context);

      expect(mockExecuteToolCall).toHaveBeenCalledWith(
        expect.objectContaining({
          arguments: { query: "test query" },
        }),
        expect.any(Object)
      );
      expect(result.success).toBe(true);
    });

    it('should support "inputMapping" config format (used by flow-templates)', async () => {
      const step = createTestStep({
        type: "tool",
        config: {
          toolName: "search",
          inputMapping: "{{promptOutput}}",
        },
        connections: { next: "step-2" },
      });
      const context = createTestContext();
      context.variables["promptOutput"] = "mapped value";

      const result = await stepHandlers.tool(step, context);

      expect(mockExecuteToolCall).toHaveBeenCalledWith(
        expect.objectContaining({
          arguments: { input: "mapped value" },
        }),
        expect.any(Object)
      );
      expect(result.success).toBe(true);
    });

    it('should prioritize "args" over "parameters" and "inputMapping"', async () => {
      const step = createTestStep({
        type: "tool",
        config: {
          toolName: "test_tool",
          args: { primary: "value" },
          parameters: { secondary: "ignored" },
          inputMapping: "{{ignored}}",
        },
        connections: { next: "step-2" },
      });
      const context = createTestContext();

      await stepHandlers.tool(step, context);

      expect(mockExecuteToolCall).toHaveBeenCalledWith(
        expect.objectContaining({
          arguments: { primary: "value" },
        }),
        expect.any(Object)
      );
    });
  });

  describe("condition handler", () => {
    it("should branch to onTrue when condition is true", async () => {
      const step = createTestStep({
        type: "condition",
        config: { condition: "hasResults" },
        connections: { onTrue: "true-step", onFalse: "false-step" },
      });
      const context = createTestContext();
      context.variables["hasResults"] = true;

      const result = await stepHandlers.condition(step, context);

      expect(result.success).toBe(true);
      expect(result.output).toBe(true);
      expect(result.nextStepId).toBe("true-step");
    });

    it("should branch to onFalse when condition is false", async () => {
      const step = createTestStep({
        type: "condition",
        config: { condition: "hasResults" },
        connections: { onTrue: "true-step", onFalse: "false-step" },
      });
      const context = createTestContext();
      context.variables["hasResults"] = false;

      const result = await stepHandlers.condition(step, context);

      expect(result.success).toBe(true);
      expect(result.output).toBe(false);
      expect(result.nextStepId).toBe("false-step");
    });

    it("should evaluate comparison expressions", async () => {
      const step = createTestStep({
        type: "condition",
        config: { condition: "count > 5" },
        connections: { onTrue: "true-step", onFalse: "false-step" },
      });
      const context = createTestContext();
      context.variables["count"] = 10;

      const result = await stepHandlers.condition(step, context);

      expect(result.output).toBe(true);
      expect(result.nextStepId).toBe("true-step");
    });

    it('should handle "exists" conditions', async () => {
      const step = createTestStep({
        type: "condition",
        config: { condition: "data exists" },
        connections: { onTrue: "true-step", onFalse: "false-step" },
      });
      const context = createTestContext();
      context.variables["data"] = "some value";

      const result = await stepHandlers.condition(step, context);

      expect(result.output).toBe(true);
      expect(result.nextStepId).toBe("true-step");
    });

    it('should handle "is empty" conditions', async () => {
      const step = createTestStep({
        type: "condition",
        config: { condition: "data is empty" },
        connections: { onTrue: "true-step", onFalse: "false-step" },
      });
      const context = createTestContext();
      context.variables["data"] = "";

      const result = await stepHandlers.condition(step, context);

      expect(result.output).toBe(true);
      expect(result.nextStepId).toBe("true-step");
    });

    it('should handle "is not empty" conditions', async () => {
      const step = createTestStep({
        type: "condition",
        config: { condition: "data is not empty" },
        connections: { onTrue: "true-step", onFalse: "false-step" },
      });
      const context = createTestContext();
      context.variables["data"] = "hello";

      const result = await stepHandlers.condition(step, context);

      expect(result.output).toBe(true);
      expect(result.nextStepId).toBe("true-step");
    });

    it('should handle "contains" conditions', async () => {
      const step = createTestStep({
        type: "condition",
        config: { condition: "text contains 'hello'" },
        connections: { onTrue: "true-step", onFalse: "false-step" },
      });
      const context = createTestContext();
      context.variables["text"] = "hello world";

      const result = await stepHandlers.condition(step, context);

      expect(result.output).toBe(true);
      expect(result.nextStepId).toBe("true-step");
    });

    it("should throw error if condition is missing", async () => {
      const step = createTestStep({
        type: "condition",
        config: {},
      });
      const context = createTestContext();

      const result = await stepHandlers.condition(step, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain("condition");
    });

    it("should create a span for condition evaluation", async () => {
      const step = createTestStep({
        type: "condition",
        config: { condition: "true" },
        connections: { onTrue: "next" },
      });
      const context = createTestContext();

      await stepHandlers.condition(step, context);

      expect(mockCreateSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          attemptId: context.attemptId,
          type: "reasoning",
        }),
        true
      );
      expect(context.spans).toHaveLength(1);
    });
  });

  describe("loop handler", () => {
    it("should iterate and continue to loop body", async () => {
      const step = createTestStep({
        type: "loop",
        config: { maxIterations: 3 },
        connections: { onTrue: "loop-body", onFalse: "after-loop" },
      });
      const context = createTestContext();

      // First iteration
      const result1 = await stepHandlers.loop(step, context);
      expect(result1.output).toBe(0);
      expect(result1.nextStepId).toBe("loop-body");
      expect(context.variables["loopIndex"]).toBe(0);

      // Second iteration
      const result2 = await stepHandlers.loop(step, context);
      expect(result2.output).toBe(1);
      expect(context.variables["loopIndex"]).toBe(1);

      // Third iteration
      const result3 = await stepHandlers.loop(step, context);
      expect(result3.output).toBe(2);

      // Loop complete
      const result4 = await stepHandlers.loop(step, context);
      expect(result4.nextStepId).toBe("after-loop");
    });

    it("should iterate over items array", async () => {
      const step = createTestStep({
        type: "loop",
        config: {
          itemsVariable: "items",
          itemVariable: "currentItem",
        },
        connections: { onTrue: "loop-body", onFalse: "after-loop" },
      });
      const context = createTestContext();
      context.variables["items"] = ["a", "b", "c"];

      // First iteration
      await stepHandlers.loop(step, context);
      expect(context.variables["currentItem"]).toBe("a");

      // Second iteration
      await stepHandlers.loop(step, context);
      expect(context.variables["currentItem"]).toBe("b");

      // Third iteration
      await stepHandlers.loop(step, context);
      expect(context.variables["currentItem"]).toBe("c");

      // Loop complete
      const result4 = await stepHandlers.loop(step, context);
      expect(result4.nextStepId).toBe("after-loop");
    });

    it("should clean up loop state after completion", async () => {
      const step = createTestStep({
        type: "loop",
        config: { maxIterations: 1 },
        connections: { onTrue: "loop-body", onFalse: "after-loop" },
      });
      const context = createTestContext();

      // First iteration
      await stepHandlers.loop(step, context);
      expect(context.loopState.has(step.id)).toBe(true);

      // Loop complete
      await stepHandlers.loop(step, context);
      expect(context.loopState.has(step.id)).toBe(false);
    });
  });

  describe("output handler", () => {
    it("should terminate flow with output", async () => {
      const step = createTestStep({
        type: "output",
        config: { variable: "result" },
      });
      const context = createTestContext();
      context.variables["result"] = "Final output";

      const result = await stepHandlers.output(step, context);

      expect(result.success).toBe(true);
      expect(result.output).toBe("Final output");
      expect(result.nextStepId).toBeNull();
    });

    it("should use template interpolation for output", async () => {
      const step = createTestStep({
        type: "output",
        config: { template: "Result: {{result}}" },
      });
      const context = createTestContext();
      context.variables["result"] = "Success";

      const result = await stepHandlers.output(step, context);

      expect(result.output).toBe("Result: Success");
    });

    it("should default to lastOutput variable", async () => {
      const step = createTestStep({
        type: "output",
        config: {},
      });
      const context = createTestContext();
      context.variables["lastOutput"] = "Default output";

      const result = await stepHandlers.output(step, context);

      expect(result.output).toBe("Default output");
    });

    it("should NOT fall back to input if no lastOutput (to avoid leaking internal prompts)", async () => {
      // This behavior prevents leaking internal test prompts like "Please demonstrate your capabilities..."
      const step = createTestStep({
        type: "output",
        config: {},
      });
      const context = createTestContext({
        input: "Please demonstrate your capabilities...",
      });
      // The input might contain internal test prompts that should never be shown to users
      context.variables["input"] = "Please demonstrate your capabilities...";
      // No lastOutput set

      const result = await stepHandlers.output(step, context);

      // Should return empty string, not the internal test input
      expect(result.output).toBe("");
    });

    it("should create a span for the output step", async () => {
      const step = createTestStep({ type: "output" });
      const context = createTestContext();
      context.variables["input"] = "test";

      await stepHandlers.output(step, context);

      expect(mockCreateSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          attemptId: context.attemptId,
          type: "output",
        }),
        true
      );
      expect(context.spans).toHaveLength(1);
    });
  });
});

describe("Helper Functions", () => {
  describe("interpolate", () => {
    it("should replace simple variable references", () => {
      const result = interpolate("Hello {{name}}!", { name: "World" });
      expect(result).toBe("Hello World!");
    });

    it("should handle nested variable references", () => {
      const result = interpolate("{{user.name}}", {
        user: { name: "Alice" },
      });
      expect(result).toBe("Alice");
    });

    it("should keep original if variable not found", () => {
      const result = interpolate("Hello {{unknown}}!", {});
      expect(result).toBe("Hello {{unknown}}!");
    });

    it("should JSON stringify objects", () => {
      const result = interpolate("Data: {{data}}", {
        data: { key: "value" },
      });
      expect(result).toBe('Data: {"key":"value"}');
    });

    it("should handle multiple variables", () => {
      const result = interpolate("{{greeting}}, {{name}}!", {
        greeting: "Hello",
        name: "World",
      });
      expect(result).toBe("Hello, World!");
    });

    it("should handle null and undefined gracefully", () => {
      const result1 = interpolate("{{nullVar}}", { nullVar: null });
      expect(result1).toBe("{{nullVar}}");

      const result2 = interpolate("{{undefinedVar}}", {});
      expect(result2).toBe("{{undefinedVar}}");
    });
  });

  describe("evaluateCondition", () => {
    it("should evaluate simple boolean variables", () => {
      expect(evaluateCondition("isActive", { isActive: true })).toBe(true);
      expect(evaluateCondition("isActive", { isActive: false })).toBe(false);
    });

    it("should evaluate comparison operators", () => {
      expect(evaluateCondition("count > 5", { count: 10 })).toBe(true);
      expect(evaluateCondition("count < 5", { count: 10 })).toBe(false);
      expect(evaluateCondition("count === 10", { count: 10 })).toBe(true);
    });

    it('should handle "and" logical operator', () => {
      expect(evaluateCondition("a and b", { a: true, b: true })).toBe(true);
      expect(evaluateCondition("a and b", { a: true, b: false })).toBe(false);
    });

    it('should handle "or" logical operator', () => {
      expect(evaluateCondition("a or b", { a: false, b: true })).toBe(true);
      expect(evaluateCondition("a or b", { a: false, b: false })).toBe(false);
    });

    it('should handle "not" logical operator', () => {
      expect(evaluateCondition("not a", { a: false })).toBe(true);
      expect(evaluateCondition("not a", { a: true })).toBe(false);
    });

    it("should return false for invalid expressions", () => {
      expect(evaluateCondition("invalid syntax {{{", {})).toBe(false);
    });
  });

  describe("buildStepMap", () => {
    it("should create a map of steps by id", () => {
      const steps: AgentFlowStep[] = [
        createTestStep({ id: "step-1", name: "Step 1" }),
        createTestStep({ id: "step-2", name: "Step 2" }),
      ];

      const map = buildStepMap(steps);

      expect(map.size).toBe(2);
      expect(map.get("step-1")?.name).toBe("Step 1");
      expect(map.get("step-2")?.name).toBe("Step 2");
    });

    it("should return empty map for empty steps", () => {
      const map = buildStepMap([]);
      expect(map.size).toBe(0);
    });
  });

  describe("findStartStep", () => {
    it('should find step with type "start"', () => {
      const steps: AgentFlowStep[] = [
        createTestStep({ id: "step-1", type: "prompt" }),
        createTestStep({ id: "step-2", type: "start" }),
        createTestStep({ id: "step-3", type: "output" }),
      ];

      const startStep = findStartStep(steps);

      expect(startStep?.id).toBe("step-2");
    });

    it("should return first step if no start type exists", () => {
      const steps: AgentFlowStep[] = [
        createTestStep({ id: "step-1", type: "prompt" }),
        createTestStep({ id: "step-2", type: "output" }),
      ];

      const startStep = findStartStep(steps);

      expect(startStep?.id).toBe("step-1");
    });

    it("should return null for empty steps", () => {
      const startStep = findStartStep([]);
      expect(startStep).toBeNull();
    });
  });

  describe("getNextStep", () => {
    it("should get next step from connections", () => {
      const step = createTestStep({
        id: "step-1",
        connections: { next: "step-2" },
      });
      const stepMap = buildStepMap([
        step,
        createTestStep({ id: "step-2", name: "Next Step" }),
      ]);

      const nextStep = getNextStep(step, stepMap);

      expect(nextStep?.id).toBe("step-2");
    });

    it("should get onTrue branch", () => {
      const step = createTestStep({
        id: "step-1",
        connections: { onTrue: "true-step", onFalse: "false-step" },
      });
      const stepMap = buildStepMap([
        step,
        createTestStep({ id: "true-step" }),
        createTestStep({ id: "false-step" }),
      ]);

      const nextStep = getNextStep(step, stepMap, "onTrue");

      expect(nextStep?.id).toBe("true-step");
    });

    it("should return null if connection not found", () => {
      const step = createTestStep({
        id: "step-1",
        connections: { next: "nonexistent" },
      });
      const stepMap = buildStepMap([step]);

      const nextStep = getNextStep(step, stepMap);

      expect(nextStep).toBeNull();
    });

    it("should return null if no connection specified", () => {
      const step = createTestStep({
        id: "step-1",
        connections: {},
      });
      const stepMap = buildStepMap([step]);

      const nextStep = getNextStep(step, stepMap);

      expect(nextStep).toBeNull();
    });
  });

  describe("createFlowContext", () => {
    it("should create a context with required fields", () => {
      const agent = createTestAgent();
      const context = createFlowContext(agent, "Test input", "attempt-123");

      expect(context.agent).toBe(agent);
      expect(context.input).toBe("Test input");
      expect(context.attemptId).toBe("attempt-123");
      expect(context.variables).toEqual({});
      expect(context.sequence).toBe(0);
      expect(context.spans).toEqual([]);
      expect(context.loopState).toBeInstanceOf(Map);
      expect(context.createSpans).toBe(true);
    });

    it("should include optional sessionContext", () => {
      const agent = createTestAgent();
      const context = createFlowContext(agent, "Test input", "attempt-123", {
        sessionContext: "Session data",
      });

      expect(context.sessionContext).toBe("Session data");
    });

    it("should include optional parentSpanId", () => {
      const agent = createTestAgent();
      const context = createFlowContext(agent, "Test input", "attempt-123", {
        parentSpanId: "parent-span-123",
      });

      expect(context.parentSpanId).toBe("parent-span-123");
    });
  });
});
