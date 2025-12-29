import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import type { AgentDefinition, AgentFlowStep } from '../../../types/agent';

// Mock the LLM API
vi.mock('../../../api/llm', () => ({
  generateWithSystem: vi.fn(),
  generateText: vi.fn(),
}));

// Mock the tool executor
vi.mock('../../tools/executor', () => ({
  executeToolCall: vi.fn(),
}));

// Mock the database queries
vi.mock('../../../db/queries', () => ({
  createSpan: vi.fn(),
  updateAttempt: vi.fn(),
}));

// Import modules (mocks will be in place)
import {
  executeFlow,
  executeSinglePrompt,
  validateFlow,
  createSimpleFlow,
  createToolFlow,
  executeFlowWithRetry,
} from '../executor';
import { generateWithSystem } from '../../../api/llm';
import { updateAttempt, createSpan } from '../../../db/queries';
import { executeToolCall } from '../../tools/executor';

// Cast mocked functions for easier use
const mockGenerateWithSystem = generateWithSystem as Mock;
const mockUpdateAttempt = updateAttempt as Mock;
const mockCreateSpan = createSpan as Mock;
const mockExecuteToolCall = executeToolCall as Mock;

// Helper to create a test agent
function createTestAgent(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    id: 'agent-123',
    name: 'Test Agent',
    description: 'A test agent',
    version: 1,
    systemPrompt: 'You are a helpful assistant.',
    tools: [],
    flow: [],
    memory: { type: 'buffer', config: { maxMessages: 10 } },
    parameters: { model: 'claude-sonnet', temperature: 0.7, maxTokens: 1024 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

// Helper to create a test flow step
function createTestStep(overrides: Partial<AgentFlowStep> = {}): AgentFlowStep {
  return {
    id: 'step-1',
    type: 'start',
    name: 'Test Step',
    config: {},
    position: { x: 0, y: 0 },
    connections: {},
    ...overrides,
  };
}

describe('Flow Executor', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock implementations
    mockGenerateWithSystem.mockResolvedValue('LLM response');
    mockExecuteToolCall.mockResolvedValue({
      toolCall: { id: 'tool-1', name: 'test_tool', arguments: {} },
      result: { success: true, output: 'Tool result', metadata: {} },
      spanId: 'span-tool-1',
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

  describe('executeFlow', () => {
    it('should traverse nodes in order', async () => {
      const flow: AgentFlowStep[] = [
        createTestStep({
          id: 'start',
          type: 'start',
          connections: { next: 'prompt' },
        }),
        createTestStep({
          id: 'prompt',
          type: 'prompt',
          config: { template: '{{input}}' },
          connections: { next: 'output' },
        }),
        createTestStep({
          id: 'output',
          type: 'output',
          config: { variable: 'lastOutput' },
          connections: {},
        }),
      ];

      const agent = createTestAgent({ flow });
      const result = await executeFlow(agent, 'Test input', 'attempt-123');

      expect(result.success).toBe(true);
      expect(result.stepsExecuted).toBe(3);
      expect(result.output).toBe('LLM response');
    });

    it('should handle missing start step by fallback to single prompt', async () => {
      const agent = createTestAgent({ flow: [] });
      const result = await executeFlow(agent, 'Test input', 'attempt-123');

      // Falls back to single prompt execution
      expect(result.success).toBe(true);
      expect(result.stepsExecuted).toBe(1);
      expect(mockGenerateWithSystem).toHaveBeenCalled();
    });

    it('should handle flow with only non-start step by using first step', async () => {
      const flow: AgentFlowStep[] = [
        createTestStep({
          id: 'prompt-only',
          type: 'prompt',
          config: { template: '{{input}}' },
          connections: { next: 'output' },
        }),
        createTestStep({
          id: 'output',
          type: 'output',
          config: {},
          connections: {},
        }),
      ];

      const agent = createTestAgent({ flow });
      const result = await executeFlow(agent, 'Test input', 'attempt-123');

      expect(result.success).toBe(true);
      expect(result.stepsExecuted).toBe(2);
    });

    it('should record spans for each step', async () => {
      const flow: AgentFlowStep[] = [
        createTestStep({
          id: 'start',
          type: 'start',
          connections: { next: 'prompt' },
        }),
        createTestStep({
          id: 'prompt',
          type: 'prompt',
          config: {},
          connections: { next: 'output' },
        }),
        createTestStep({
          id: 'output',
          type: 'output',
          config: {},
          connections: {},
        }),
      ];

      const agent = createTestAgent({ flow });
      const result = await executeFlow(agent, 'Test input', 'attempt-123');

      // Each step creates a span
      expect(result.spans.length).toBe(3);
    });

    it('should stop at max step limit to prevent infinite loops', async () => {
      // Create a loop that would run forever without max steps
      const flow: AgentFlowStep[] = [
        createTestStep({
          id: 'start',
          type: 'start',
          connections: { next: 'loop' },
        }),
        createTestStep({
          id: 'loop',
          type: 'loop',
          config: { maxIterations: 1000 }, // Would run 1000 times
          connections: { onTrue: 'prompt', onFalse: 'output' },
        }),
        createTestStep({
          id: 'prompt',
          type: 'prompt',
          config: {},
          connections: { next: 'loop' },
        }),
        createTestStep({
          id: 'output',
          type: 'output',
          config: {},
          connections: {},
        }),
      ];

      const agent = createTestAgent({ flow });
      const result = await executeFlow(agent, 'Test input', 'attempt-123', {
        maxSteps: 10,
      });

      expect(result.stepsExecuted).toBe(10);
      expect(result.error).toContain('maximum steps limit');
    });

    it('should return success/failure with output and spans', async () => {
      const flow: AgentFlowStep[] = [
        createTestStep({
          id: 'start',
          type: 'start',
          connections: { next: 'output' },
        }),
        createTestStep({
          id: 'output',
          type: 'output',
          config: { template: 'Final: {{input}}' },
          connections: {},
        }),
      ];

      const agent = createTestAgent({ flow });
      const result = await executeFlow(agent, 'Test input', 'attempt-123');

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('output');
      expect(result).toHaveProperty('spans');
      expect(result).toHaveProperty('durationMs');
      expect(result).toHaveProperty('stepsExecuted');
    });

    it('should handle step execution errors', async () => {
      mockGenerateWithSystem.mockRejectedValueOnce(new Error('LLM API Error'));

      const flow: AgentFlowStep[] = [
        createTestStep({
          id: 'start',
          type: 'start',
          connections: { next: 'prompt' },
        }),
        createTestStep({
          id: 'prompt',
          type: 'prompt',
          config: {},
          connections: {},
        }),
      ];

      const agent = createTestAgent({ flow });
      const result = await executeFlow(agent, 'Test input', 'attempt-123');

      expect(result.error).toBe('LLM API Error');
    });

    it('should follow error handler connections', async () => {
      mockGenerateWithSystem.mockRejectedValueOnce(new Error('LLM API Error'));

      const flow: AgentFlowStep[] = [
        createTestStep({
          id: 'start',
          type: 'start',
          connections: { next: 'prompt' },
        }),
        createTestStep({
          id: 'prompt',
          type: 'prompt',
          config: {},
          connections: { next: 'output', onError: 'error-output' },
        }),
        createTestStep({
          id: 'output',
          type: 'output',
          config: { template: 'Success' },
          connections: {},
        }),
        createTestStep({
          id: 'error-output',
          type: 'output',
          config: { template: 'Error: {{error}}' },
          connections: {},
        }),
      ];

      const agent = createTestAgent({ flow });
      const result = await executeFlow(agent, 'Test input', 'attempt-123');

      // Should have continued to error-output step
      expect(result.stepsExecuted).toBe(3);
      expect(result.output).toContain('Error');
    });

    it('should handle unknown step type', async () => {
      const flow: AgentFlowStep[] = [
        createTestStep({
          id: 'start',
          type: 'start',
          connections: { next: 'unknown' },
        }),
        {
          id: 'unknown',
          type: 'unknown_type' as AgentFlowStep['type'],
          name: 'Unknown',
          config: {},
          position: { x: 0, y: 0 },
          connections: {},
        },
      ];

      const agent = createTestAgent({ flow });
      const result = await executeFlow(agent, 'Test input', 'attempt-123');

      expect(result.error).toContain('Unknown step type');
    });

    it('should handle step not found in connections', async () => {
      const flow: AgentFlowStep[] = [
        createTestStep({
          id: 'start',
          type: 'start',
          connections: { next: 'nonexistent' },
        }),
      ];

      const agent = createTestAgent({ flow });
      const result = await executeFlow(agent, 'Test input', 'attempt-123');

      expect(result.error).toContain('Step not found');
    });

    it('should include variables in result', async () => {
      const flow: AgentFlowStep[] = [
        createTestStep({
          id: 'start',
          type: 'start',
          connections: { next: 'output' },
        }),
        createTestStep({
          id: 'output',
          type: 'output',
          config: {},
          connections: {},
        }),
      ];

      const agent = createTestAgent({ flow });
      const result = await executeFlow(agent, 'Test input', 'attempt-123');

      expect(result.variables).toBeDefined();
      expect(result.variables?.input).toBe('Test input');
    });

    it('should update attempt on completion', async () => {
      const flow: AgentFlowStep[] = [
        createTestStep({
          id: 'start',
          type: 'start',
          connections: { next: 'output' },
        }),
        createTestStep({
          id: 'output',
          type: 'output',
          config: {},
          connections: {},
        }),
      ];

      const agent = createTestAgent({ flow });
      await executeFlow(agent, 'Test input', 'attempt-123');

      expect(mockUpdateAttempt).toHaveBeenCalledWith(
        'attempt-123',
        expect.objectContaining({
          status: expect.any(String),
          durationMs: expect.any(Number),
        })
      );
    });

    it('should pass session context to flow context', async () => {
      const flow: AgentFlowStep[] = [
        createTestStep({
          id: 'start',
          type: 'start',
          connections: { next: 'output' },
        }),
        createTestStep({
          id: 'output',
          type: 'output',
          config: { variable: 'sessionContext' },
          connections: {},
        }),
      ];

      const agent = createTestAgent({ flow });
      const result = await executeFlow(agent, 'Test input', 'attempt-123', {
        sessionContext: 'Previous context',
      });

      expect(result.output).toBe('Previous context');
    });
  });

  describe('executeSinglePrompt', () => {
    it('should execute a simple LLM call', async () => {
      const agent = createTestAgent();
      const result = await executeSinglePrompt(agent, 'Test input', 'attempt-123');

      expect(result.success).toBe(true);
      expect(result.output).toBe('LLM response');
      expect(result.stepsExecuted).toBe(1);
    });

    it('should include session context in prompt', async () => {
      const agent = createTestAgent();
      await executeSinglePrompt(agent, 'Test input', 'attempt-123', {
        sessionContext: 'Previous context',
      });

      expect(mockGenerateWithSystem).toHaveBeenCalledWith(
        agent.systemPrompt,
        expect.stringContaining('Previous context'),
        expect.any(Object)
      );
    });

    it('should create spans when enabled', async () => {
      const agent = createTestAgent();
      const result = await executeSinglePrompt(agent, 'Test input', 'attempt-123', {
        createSpans: true,
      });

      expect(result.spans.length).toBe(1);
    });

    it('should not create spans when disabled', async () => {
      const agent = createTestAgent();
      const result = await executeSinglePrompt(agent, 'Test input', 'attempt-123', {
        createSpans: false,
      });

      expect(result.spans.length).toBe(0);
    });

    it('should handle LLM errors', async () => {
      mockGenerateWithSystem.mockRejectedValueOnce(new Error('LLM API Error'));

      const agent = createTestAgent();
      const result = await executeSinglePrompt(agent, 'Test input', 'attempt-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('LLM API Error');
    });

    it('should update attempt on success', async () => {
      const agent = createTestAgent();
      await executeSinglePrompt(agent, 'Test input', 'attempt-123');

      expect(mockUpdateAttempt).toHaveBeenCalledWith(
        'attempt-123',
        expect.objectContaining({
          output: 'LLM response',
          status: 'succeeded',
        })
      );
    });

    it('should update attempt on failure', async () => {
      mockGenerateWithSystem.mockRejectedValueOnce(new Error('LLM API Error'));

      const agent = createTestAgent();
      await executeSinglePrompt(agent, 'Test input', 'attempt-123');

      expect(mockUpdateAttempt).toHaveBeenCalledWith(
        'attempt-123',
        expect.objectContaining({
          status: 'failed',
          error: 'LLM API Error',
        })
      );
    });
  });

  describe('validateFlow', () => {
    it('should validate a correct flow', () => {
      const flow: AgentFlowStep[] = [
        createTestStep({
          id: 'start',
          type: 'start',
          connections: { next: 'prompt' },
        }),
        createTestStep({
          id: 'prompt',
          type: 'prompt',
          connections: { next: 'output' },
        }),
        createTestStep({
          id: 'output',
          type: 'output',
          connections: {},
        }),
      ];

      const validation = validateFlow(flow);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should not error on missing start step when first step exists', () => {
      const flow: AgentFlowStep[] = [
        createTestStep({
          id: 'prompt',
          type: 'prompt',
          connections: { next: 'output' },
        }),
        createTestStep({
          id: 'output',
          type: 'output',
          connections: {},
        }),
      ];

      const validation = validateFlow(flow);

      // The first step is used as fallback, so no error
      expect(validation.valid).toBe(true);
    });

    it('should warn on missing output step', () => {
      const flow: AgentFlowStep[] = [
        createTestStep({
          id: 'start',
          type: 'start',
          connections: { next: 'prompt' },
        }),
        createTestStep({
          id: 'prompt',
          type: 'prompt',
          connections: {},
        }),
      ];

      const validation = validateFlow(flow);

      expect(validation.warnings.some((w) => w.includes('output'))).toBe(true);
    });

    it('should error on invalid connection', () => {
      const flow: AgentFlowStep[] = [
        createTestStep({
          id: 'start',
          type: 'start',
          connections: { next: 'nonexistent' },
        }),
      ];

      const validation = validateFlow(flow);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('invalid'))).toBe(true);
    });

    it('should warn on condition without branches', () => {
      const flow: AgentFlowStep[] = [
        createTestStep({
          id: 'start',
          type: 'start',
          connections: { next: 'condition' },
        }),
        createTestStep({
          id: 'condition',
          type: 'condition',
          config: { condition: 'true' },
          connections: {},
        }),
      ];

      const validation = validateFlow(flow);

      expect(validation.warnings.some((w) => w.includes('branch'))).toBe(true);
    });

    it('should warn on loop without body connection', () => {
      const flow: AgentFlowStep[] = [
        createTestStep({
          id: 'start',
          type: 'start',
          connections: { next: 'loop' },
        }),
        createTestStep({
          id: 'loop',
          type: 'loop',
          config: { maxIterations: 5 },
          connections: { onFalse: 'output' },
        }),
        createTestStep({
          id: 'output',
          type: 'output',
          connections: {},
        }),
      ];

      const validation = validateFlow(flow);

      expect(validation.warnings.some((w) => w.includes('body'))).toBe(true);
    });

    it('should error on tool step without toolName', () => {
      const flow: AgentFlowStep[] = [
        createTestStep({
          id: 'start',
          type: 'start',
          connections: { next: 'tool' },
        }),
        createTestStep({
          id: 'tool',
          type: 'tool',
          config: {},
          connections: { next: 'output' },
        }),
        createTestStep({
          id: 'output',
          type: 'output',
          connections: {},
        }),
      ];

      const validation = validateFlow(flow);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('toolName'))).toBe(true);
    });

    it('should warn on unreachable steps', () => {
      const flow: AgentFlowStep[] = [
        createTestStep({
          id: 'start',
          type: 'start',
          connections: { next: 'output' },
        }),
        createTestStep({
          id: 'output',
          type: 'output',
          connections: {},
        }),
        createTestStep({
          id: 'unreachable',
          type: 'prompt',
          connections: {},
        }),
      ];

      const validation = validateFlow(flow);

      expect(validation.warnings.some((w) => w.includes('unreachable'))).toBe(true);
    });
  });

  describe('createSimpleFlow', () => {
    it('should create a basic flow with start, prompt, and output', () => {
      const flow = createSimpleFlow();

      expect(flow).toHaveLength(3);
      expect(flow[0].type).toBe('start');
      expect(flow[1].type).toBe('prompt');
      expect(flow[2].type).toBe('output');
    });

    it('should use custom template if provided', () => {
      const flow = createSimpleFlow('Custom: {{input}}');

      expect(flow[1].config.template).toBe('Custom: {{input}}');
    });

    it('should connect steps correctly', () => {
      const flow = createSimpleFlow();

      expect(flow[0].connections.next).toBe('prompt');
      expect(flow[1].connections.next).toBe('output');
      expect(flow[2].connections.next).toBeUndefined();
    });
  });

  describe('createToolFlow', () => {
    it('should create a flow with tool step', () => {
      const flow = createToolFlow('search', { query: '{{input}}' });

      expect(flow.find((s) => s.type === 'tool')).toBeDefined();
      expect(flow.find((s) => s.type === 'tool')?.config.toolName).toBe('search');
    });

    it('should include process prompt if template provided', () => {
      const flow = createToolFlow('search', { query: '{{input}}' }, 'Process: {{toolResult}}');

      expect(flow.find((s) => s.id === 'process')).toBeDefined();
      expect(flow.find((s) => s.id === 'process')?.type).toBe('prompt');
    });

    it('should include error output step', () => {
      const flow = createToolFlow('search', { query: '{{input}}' });

      expect(flow.find((s) => s.id === 'error_output')).toBeDefined();
    });

    it('should connect tool to error handler', () => {
      const flow = createToolFlow('search', { query: '{{input}}' });
      const toolStep = flow.find((s) => s.type === 'tool');

      expect(toolStep?.connections.onError).toBe('error_output');
    });
  });

  describe('executeFlowWithRetry', () => {
    it('should return on first success', async () => {
      const flow: AgentFlowStep[] = [
        createTestStep({
          id: 'start',
          type: 'start',
          connections: { next: 'output' },
        }),
        createTestStep({
          id: 'output',
          type: 'output',
          config: {},
          connections: {},
        }),
      ];

      const agent = createTestAgent({ flow });
      const result = await executeFlowWithRetry(agent, 'Test input', 'attempt-123', {
        maxRetries: 3,
      });

      expect(result.success).toBe(true);
    });

    it('should retry on failure', async () => {
      mockGenerateWithSystem
        .mockRejectedValueOnce(new Error('First error'))
        .mockResolvedValueOnce('Success');

      const flow: AgentFlowStep[] = [
        createTestStep({
          id: 'start',
          type: 'start',
          connections: { next: 'prompt' },
        }),
        createTestStep({
          id: 'prompt',
          type: 'prompt',
          config: {},
          connections: { next: 'output' },
        }),
        createTestStep({
          id: 'output',
          type: 'output',
          config: {},
          connections: {},
        }),
      ];

      const agent = createTestAgent({ flow });
      const result = await executeFlowWithRetry(agent, 'Test input', 'attempt-123', {
        maxRetries: 3,
        retryDelayMs: 10, // Short delay for tests
      });

      expect(result.success).toBe(true);
    });

    it('should not retry on max steps exceeded error', async () => {
      const flow: AgentFlowStep[] = [
        createTestStep({
          id: 'start',
          type: 'start',
          connections: { next: 'loop' },
        }),
        createTestStep({
          id: 'loop',
          type: 'loop',
          config: { maxIterations: 100 },
          connections: { onTrue: 'prompt', onFalse: 'output' },
        }),
        createTestStep({
          id: 'prompt',
          type: 'prompt',
          config: {},
          connections: { next: 'loop' },
        }),
        createTestStep({
          id: 'output',
          type: 'output',
          config: {},
          connections: {},
        }),
      ];

      const agent = createTestAgent({ flow });
      const result = await executeFlowWithRetry(agent, 'Test input', 'attempt-123', {
        maxRetries: 3,
        maxSteps: 5,
      });

      expect(result.error).toContain('maximum steps limit');
    });

    it('should return last result after all retries fail', async () => {
      mockGenerateWithSystem.mockRejectedValue(new Error('Persistent error'));

      const flow: AgentFlowStep[] = [
        createTestStep({
          id: 'start',
          type: 'start',
          connections: { next: 'prompt' },
        }),
        createTestStep({
          id: 'prompt',
          type: 'prompt',
          config: {},
          connections: {},
        }),
      ];

      const agent = createTestAgent({ flow });
      const result = await executeFlowWithRetry(agent, 'Test input', 'attempt-123', {
        maxRetries: 2,
        retryDelayMs: 10,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Persistent error');
    });
  });

  describe('Flow with conditions and branches', () => {
    it('should follow true branch on condition', async () => {
      const flow: AgentFlowStep[] = [
        createTestStep({
          id: 'start',
          type: 'start',
          config: { variables: { shouldProcess: true } },
          connections: { next: 'condition' },
        }),
        createTestStep({
          id: 'condition',
          type: 'condition',
          config: { condition: 'shouldProcess' },
          connections: { onTrue: 'process', onFalse: 'skip' },
        }),
        createTestStep({
          id: 'process',
          type: 'output',
          config: { template: 'Processed' },
          connections: {},
        }),
        createTestStep({
          id: 'skip',
          type: 'output',
          config: { template: 'Skipped' },
          connections: {},
        }),
      ];

      const agent = createTestAgent({ flow });
      const result = await executeFlow(agent, 'Test input', 'attempt-123');

      expect(result.output).toBe('Processed');
    });

    it('should follow false branch on condition', async () => {
      const flow: AgentFlowStep[] = [
        createTestStep({
          id: 'start',
          type: 'start',
          config: { variables: { shouldProcess: false } },
          connections: { next: 'condition' },
        }),
        createTestStep({
          id: 'condition',
          type: 'condition',
          config: { condition: 'shouldProcess' },
          connections: { onTrue: 'process', onFalse: 'skip' },
        }),
        createTestStep({
          id: 'process',
          type: 'output',
          config: { template: 'Processed' },
          connections: {},
        }),
        createTestStep({
          id: 'skip',
          type: 'output',
          config: { template: 'Skipped' },
          connections: {},
        }),
      ];

      const agent = createTestAgent({ flow });
      const result = await executeFlow(agent, 'Test input', 'attempt-123');

      expect(result.output).toBe('Skipped');
    });
  });

  describe('Flow with tools', () => {
    it('should execute tool step and continue', async () => {
      const flow: AgentFlowStep[] = [
        createTestStep({
          id: 'start',
          type: 'start',
          connections: { next: 'tool' },
        }),
        createTestStep({
          id: 'tool',
          type: 'tool',
          config: { toolName: 'search', args: { query: '{{input}}' } },
          connections: { next: 'output' },
        }),
        createTestStep({
          id: 'output',
          type: 'output',
          config: { variable: 'lastToolResult' },
          connections: {},
        }),
      ];

      const agent = createTestAgent({ flow });
      const result = await executeFlow(agent, 'Test input', 'attempt-123');

      expect(mockExecuteToolCall).toHaveBeenCalled();
      expect(result.output).toBe('Tool result');
    });
  });

  describe('Flow with loops', () => {
    it('should iterate and exit loop', async () => {
      const flow: AgentFlowStep[] = [
        createTestStep({
          id: 'start',
          type: 'start',
          connections: { next: 'loop' },
        }),
        createTestStep({
          id: 'loop',
          type: 'loop',
          config: { maxIterations: 3 },
          connections: { onTrue: 'loop-body', onFalse: 'output' },
        }),
        createTestStep({
          id: 'loop-body',
          type: 'prompt',
          config: { template: 'Iteration {{loopIndex}}' },
          connections: { next: 'loop' },
        }),
        createTestStep({
          id: 'output',
          type: 'output',
          config: {},
          connections: {},
        }),
      ];

      const agent = createTestAgent({ flow });
      const result = await executeFlow(agent, 'Test input', 'attempt-123');

      expect(result.success).toBe(true);
      // start + 3x(loop + prompt) + loop(exit) + output = 9 steps
      expect(result.stepsExecuted).toBe(9);
    });
  });

  describe('Default Demo Flow Bug', () => {
    it('should NOT return test input as output when using default demo flow', async () => {
      // This tests the bug where "Please demonstrate your capabilities..." appears as artifact output
      // The test input is an internal prompt sent TO agents, not meant for user display

      const testInput = 'Please demonstrate your capabilities by responding to this request:\n\nHelp me write a poem\n\nProvide a complete, high-quality response that showcases your approach.';

      // Create the default demo flow (same structure as getDefaultDemoFlow)
      const flow: AgentFlowStep[] = [
        createTestStep({
          id: 'start-1',
          type: 'start',
          name: 'Start',
          config: {},
          connections: { next: 'prompt-1' },
        }),
        createTestStep({
          id: 'prompt-1',
          type: 'prompt',
          name: 'Process Input',
          config: {
            template: 'Analyze the user input and determine the best approach.',
          },
          connections: { next: 'condition-1' },
        }),
        createTestStep({
          id: 'condition-1',
          type: 'condition',
          name: 'Needs Tool?',
          config: {
            condition: 'response.requiresTool === true',
          },
          connections: { onTrue: 'tool-1', onFalse: 'output-1' },
        }),
        createTestStep({
          id: 'tool-1',
          type: 'tool',
          name: 'Execute Tool',
          config: {
            toolName: 'web_search',
            parameters: { query: '{{input}}' },
          },
          connections: { next: 'output-1', onError: 'output-1' },
        }),
        createTestStep({
          id: 'output-1',
          type: 'output',
          name: 'Generate Response',
          config: {
            format: 'markdown',
          },
          connections: {},
        }),
      ];

      const agent = createTestAgent({ flow });
      const result = await executeFlow(agent, testInput, 'attempt-123');

      // The output should NEVER contain the test input prompt text
      expect(result.output).not.toContain('Please demonstrate your capabilities');
      expect(result.output).not.toContain('Provide a complete, high-quality response');

      // It SHOULD contain the LLM's actual response
      expect(result.output).toBe('LLM response');
    });

    it('should NOT return test input even when prompt step fails', async () => {
      // When LLM fails, we should still not leak the internal test input
      mockGenerateWithSystem.mockRejectedValueOnce(new Error('LLM API Error'));

      const testInput = 'Please demonstrate your capabilities by responding to this request:\n\nHelp me write a poem\n\nProvide a complete, high-quality response that showcases your approach.';

      const flow: AgentFlowStep[] = [
        createTestStep({
          id: 'start-1',
          type: 'start',
          config: {},
          connections: { next: 'prompt-1' },
        }),
        createTestStep({
          id: 'prompt-1',
          type: 'prompt',
          config: {
            template: 'Analyze the user input and determine the best approach.',
          },
          connections: { next: 'output-1' },
        }),
        createTestStep({
          id: 'output-1',
          type: 'output',
          config: { format: 'markdown' },
          connections: {},
        }),
      ];

      const agent = createTestAgent({ flow });
      const result = await executeFlow(agent, testInput, 'attempt-123');

      // Even on error, the output should NOT contain the test input
      expect(result.output).not.toContain('Please demonstrate your capabilities');
      expect(result.output).not.toContain('Provide a complete, high-quality response');
    });

    it('should pass user input to LLM, not just the template', async () => {
      // The actual user need should be sent to the LLM, not just a meta-instruction
      const userNeed = 'Help me write a poem about the ocean';
      const testInput = `Please demonstrate your capabilities by responding to this request:\n\n${userNeed}\n\nProvide a complete, high-quality response that showcases your approach.`;

      const flow: AgentFlowStep[] = [
        createTestStep({
          id: 'start',
          type: 'start',
          config: {},
          connections: { next: 'prompt' },
        }),
        createTestStep({
          id: 'prompt',
          type: 'prompt',
          config: {
            // Template should include {{input}} to pass user input to LLM
            template: '{{input}}',
          },
          connections: { next: 'output' },
        }),
        createTestStep({
          id: 'output',
          type: 'output',
          config: { variable: 'lastOutput' },
          connections: {},
        }),
      ];

      const agent = createTestAgent({ flow });
      await executeFlow(agent, testInput, 'attempt-123');

      // The LLM should receive the full input (which contains the user's need)
      expect(mockGenerateWithSystem).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining(userNeed),
        expect.any(Object)
      );
    });
  });
});
