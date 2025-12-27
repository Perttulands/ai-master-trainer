import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  toolRegistry,
  ToolRegistryClass,
  type ToolImplementation,
  type ToolExecutionParams,
} from '../registry';

// Helper to create a mock tool
function createMockTool(name: string, overrides?: Partial<ToolImplementation>): ToolImplementation {
  return {
    name,
    description: `Description for ${name}`,
    execute: vi.fn().mockResolvedValue({
      success: true,
      output: { result: `Result from ${name}` },
      metadata: { executionTimeMs: 10 },
    }),
    ...overrides,
  };
}

describe('ToolRegistry', () => {
  let registry: ToolRegistryClass;

  beforeEach(() => {
    // Create a fresh registry for each test to avoid cross-test pollution
    registry = new ToolRegistryClass();
  });

  describe('register()', () => {
    it('should add a tool to the registry', () => {
      const tool = createMockTool('test_tool');

      registry.register(tool);

      expect(registry.has('test_tool')).toBe(true);
    });

    it('should overwrite existing tool with same name and warn', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const tool1 = createMockTool('duplicate_tool');
      const tool2 = createMockTool('duplicate_tool', {
        description: 'Updated description',
      });

      registry.register(tool1);
      registry.register(tool2);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Tool "duplicate_tool" is already registered. Overwriting.'
      );
      expect(registry.get('duplicate_tool')?.description).toBe('Updated description');

      consoleWarnSpy.mockRestore();
    });

    it('should handle multiple different tools', () => {
      const tool1 = createMockTool('tool_1');
      const tool2 = createMockTool('tool_2');
      const tool3 = createMockTool('tool_3');

      registry.register(tool1);
      registry.register(tool2);
      registry.register(tool3);

      expect(registry.has('tool_1')).toBe(true);
      expect(registry.has('tool_2')).toBe(true);
      expect(registry.has('tool_3')).toBe(true);
    });
  });

  describe('registerAll()', () => {
    it('should register multiple tools at once', () => {
      const tools = [
        createMockTool('batch_tool_1'),
        createMockTool('batch_tool_2'),
        createMockTool('batch_tool_3'),
      ];

      registry.registerAll(tools);

      expect(registry.has('batch_tool_1')).toBe(true);
      expect(registry.has('batch_tool_2')).toBe(true);
      expect(registry.has('batch_tool_3')).toBe(true);
    });

    it('should handle empty array', () => {
      registry.registerAll([]);

      expect(registry.getRegisteredTools()).toEqual([]);
    });
  });

  describe('has()', () => {
    it('should return true for registered tool', () => {
      const tool = createMockTool('existing_tool');
      registry.register(tool);

      expect(registry.has('existing_tool')).toBe(true);
    });

    it('should return false for unregistered tool', () => {
      expect(registry.has('nonexistent_tool')).toBe(false);
    });

    it('should return false after clearing registry', () => {
      const tool = createMockTool('temp_tool');
      registry.register(tool);
      registry.clear();

      expect(registry.has('temp_tool')).toBe(false);
    });
  });

  describe('get()', () => {
    it('should return the tool implementation for registered tool', () => {
      const tool = createMockTool('get_test_tool');
      registry.register(tool);

      const retrieved = registry.get('get_test_tool');

      expect(retrieved).toBe(tool);
      expect(retrieved?.name).toBe('get_test_tool');
      expect(retrieved?.description).toBe('Description for get_test_tool');
    });

    it('should return undefined for unregistered tool', () => {
      const retrieved = registry.get('nonexistent_tool');

      expect(retrieved).toBeUndefined();
    });
  });

  describe('execute()', () => {
    it('should run registered tool and return result', async () => {
      const tool = createMockTool('exec_tool');
      registry.register(tool);

      const params: ToolExecutionParams = {
        args: { query: 'test query' },
        context: { sessionId: 'session-123' },
      };

      const result = await registry.execute('exec_tool', params);

      expect(tool.execute).toHaveBeenCalledWith(params);
      expect(result.success).toBe(true);
      expect(result.output).toEqual({ result: 'Result from exec_tool' });
      expect(result.metadata?.executionTimeMs).toBeDefined();
    });

    it('should return error for unknown tool', async () => {
      const result = await registry.execute('unknown_tool', { args: {} });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Tool "unknown_tool" is not registered');
      expect(result.output).toBeNull();
      expect(result.metadata?.executionTimeMs).toBeDefined();
    });

    it('should handle tool execution errors gracefully', async () => {
      const errorTool = createMockTool('error_tool', {
        execute: vi.fn().mockRejectedValue(new Error('Tool execution failed')),
      });
      registry.register(errorTool);

      const result = await registry.execute('error_tool', { args: {} });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Tool execution failed');
      expect(result.output).toBeNull();
      expect(result.metadata?.executionTimeMs).toBeDefined();
    });

    it('should handle non-Error exceptions', async () => {
      const throwingTool = createMockTool('throw_tool', {
        execute: vi.fn().mockRejectedValue('String error'),
      });
      registry.register(throwingTool);

      const result = await registry.execute('throw_tool', { args: {} });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error during tool execution');
    });

    it('should preserve tool-provided execution time', async () => {
      const timedTool = createMockTool('timed_tool', {
        execute: vi.fn().mockResolvedValue({
          success: true,
          output: 'result',
          metadata: { executionTimeMs: 500 },
        }),
      });
      registry.register(timedTool);

      const result = await registry.execute('timed_tool', { args: {} });

      expect(result.metadata?.executionTimeMs).toBe(500);
    });

    it('should calculate execution time if not provided by tool', async () => {
      const noTimeTool = createMockTool('no_time_tool', {
        execute: vi.fn().mockResolvedValue({
          success: true,
          output: 'result',
          // No metadata provided
        }),
      });
      registry.register(noTimeTool);

      const result = await registry.execute('no_time_tool', { args: {} });

      expect(result.metadata?.executionTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getRegisteredTools()', () => {
    it('should return all registered tool names', () => {
      registry.register(createMockTool('tool_a'));
      registry.register(createMockTool('tool_b'));
      registry.register(createMockTool('tool_c'));

      const tools = registry.getRegisteredTools();

      expect(tools).toContain('tool_a');
      expect(tools).toContain('tool_b');
      expect(tools).toContain('tool_c');
      expect(tools.length).toBe(3);
    });

    it('should return empty array when no tools registered', () => {
      const tools = registry.getRegisteredTools();

      expect(tools).toEqual([]);
    });
  });

  describe('getToolDescriptions()', () => {
    it('should return name and description for all tools', () => {
      registry.register(createMockTool('desc_tool_1'));
      registry.register(createMockTool('desc_tool_2'));

      const descriptions = registry.getToolDescriptions();

      expect(descriptions).toContainEqual({
        name: 'desc_tool_1',
        description: 'Description for desc_tool_1',
      });
      expect(descriptions).toContainEqual({
        name: 'desc_tool_2',
        description: 'Description for desc_tool_2',
      });
    });

    it('should return empty array when no tools registered', () => {
      const descriptions = registry.getToolDescriptions();

      expect(descriptions).toEqual([]);
    });
  });

  describe('clear()', () => {
    it('should remove all registered tools', () => {
      registry.register(createMockTool('clear_tool_1'));
      registry.register(createMockTool('clear_tool_2'));

      expect(registry.getRegisteredTools().length).toBe(2);

      registry.clear();

      expect(registry.getRegisteredTools().length).toBe(0);
      expect(registry.has('clear_tool_1')).toBe(false);
      expect(registry.has('clear_tool_2')).toBe(false);
    });
  });

  describe('singleton toolRegistry', () => {
    beforeEach(() => {
      // Clear the singleton for each test
      toolRegistry.clear();
    });

    it('should be a ToolRegistryClass instance', () => {
      expect(toolRegistry).toBeInstanceOf(ToolRegistryClass);
    });

    it('should persist state across usage', () => {
      toolRegistry.register(createMockTool('singleton_tool'));

      expect(toolRegistry.has('singleton_tool')).toBe(true);
    });
  });
});
