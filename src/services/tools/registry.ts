/**
 * Tool Registry
 *
 * Central registry for tool implementations. Agents define tools in their
 * configuration, and this registry provides the actual implementations
 * that get executed at runtime.
 */

/**
 * Result of a tool execution
 */
export interface ToolResult {
  /** Whether the tool executed successfully */
  success: boolean;
  /** The output from the tool (when successful) */
  output: unknown;
  /** Error message (when failed) */
  error?: string;
  /** Execution metadata */
  metadata?: {
    executionTimeMs: number;
    [key: string]: unknown;
  };
}

/**
 * Parameters passed to a tool implementation
 */
export interface ToolExecutionParams {
  /** The arguments passed by the LLM */
  args: Record<string, unknown>;
  /** Optional context about the current execution */
  context?: {
    agentId?: string;
    attemptId?: string;
    sessionId?: string;
  };
}

/**
 * A tool implementation that can be registered and executed
 */
export interface ToolImplementation {
  /** Unique name of the tool */
  name: string;
  /** Human-readable description */
  description: string;
  /** The execution function */
  execute: (params: ToolExecutionParams) => Promise<ToolResult>;
}

/**
 * Tool Registry class - manages tool registration and execution
 */
class ToolRegistryClass {
  private tools: Map<string, ToolImplementation> = new Map();

  /**
   * Register a tool implementation
   */
  register(tool: ToolImplementation): void {
    if (this.tools.has(tool.name)) {
      console.warn(`Tool "${tool.name}" is already registered. Overwriting.`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Register multiple tools at once
   */
  registerAll(tools: ToolImplementation[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * Check if a tool is registered
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get a tool implementation by name
   */
  get(name: string): ToolImplementation | undefined {
    return this.tools.get(name);
  }

  /**
   * Execute a tool by name
   */
  async execute(name: string, params: ToolExecutionParams): Promise<ToolResult> {
    const startTime = Date.now();
    const tool = this.tools.get(name);

    if (!tool) {
      return {
        success: false,
        output: null,
        error: `Tool "${name}" is not registered`,
        metadata: {
          executionTimeMs: Date.now() - startTime,
        },
      };
    }

    try {
      const result = await tool.execute(params);
      // Ensure metadata includes execution time
      return {
        ...result,
        metadata: {
          ...result.metadata,
          executionTimeMs: result.metadata?.executionTimeMs ?? (Date.now() - startTime),
        },
      };
    } catch (error) {
      return {
        success: false,
        output: null,
        error: error instanceof Error ? error.message : 'Unknown error during tool execution',
        metadata: {
          executionTimeMs: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Get all registered tool names
   */
  getRegisteredTools(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get tool descriptions for LLM context
   */
  getToolDescriptions(): { name: string; description: string }[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
    }));
  }

  /**
   * Clear all registered tools (useful for testing)
   */
  clear(): void {
    this.tools.clear();
  }
}

// Export singleton instance
export const toolRegistry = new ToolRegistryClass();

// Also export the class for testing purposes
export { ToolRegistryClass };
