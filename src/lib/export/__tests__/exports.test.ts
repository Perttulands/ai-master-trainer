/**
 * Export Module Tests
 *
 * Tests for the export modules that convert AgentDefinition to
 * TypeScript, Python, and JSON formats.
 */

import { describe, it, expect } from 'vitest';
import { exportToTypeScript } from '../to-typescript';
import { exportToJson, type JsonExportData } from '../to-json';
import { exportToPython } from '../to-python';
import type { AgentDefinition } from '../../../types/agent';

// Helper to create a test agent
function createTestAgent(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    id: 'test-agent-id',
    name: 'Test Agent',
    description: 'A test agent for unit testing',
    version: 3,
    systemPrompt: 'You are a helpful assistant that provides clear and accurate information.',
    tools: [
      {
        id: 'tool-1',
        name: 'search_web',
        description: 'Search the web for information',
        type: 'builtin',
        config: { builtinName: 'search_web' },
        parameters: [
          { name: 'query', type: 'string', description: 'The search query', required: true },
          { name: 'limit', type: 'number', description: 'Maximum results to return', required: false },
        ],
      },
      {
        id: 'tool-2',
        name: 'calculate',
        description: "Perform mathematical calculations",
        type: 'builtin',
        config: { builtinName: 'calculate' },
        parameters: [
          { name: 'expression', type: 'string', description: 'Math expression to evaluate', required: true },
        ],
      },
    ],
    flow: [],
    memory: { type: 'none', config: {} },
    parameters: {
      model: 'claude-sonnet-4-20250514',
      temperature: 0.7,
      maxTokens: 2048,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('exportToTypeScript', () => {
  it('generates valid TypeScript code structure', () => {
    const agent = createTestAgent();
    const output = exportToTypeScript(agent);

    // Check for required imports
    expect(output).toContain("import Anthropic from '@anthropic-ai/sdk'");

    // Check for configuration section
    expect(output).toContain('const SYSTEM_PROMPT');
    expect(output).toContain('const MODEL');
    expect(output).toContain('const MAX_TOKENS');

    // Check for tools array
    expect(output).toContain('const tools: Anthropic.Tool[]');

    // Check for main functions
    expect(output).toContain('async function handleToolCall');
    expect(output).toContain('function processResponse');
    expect(output).toContain('async function runAgent');
    expect(output).toContain('async function main');

    // Check for exports
    expect(output).toContain('export { runAgent');
  });

  it('includes agent metadata in comments', () => {
    const agent = createTestAgent({
      name: 'My Custom Agent',
      version: 5,
      description: 'Custom description here',
    });
    const output = exportToTypeScript(agent);

    expect(output).toContain('Agent: My Custom Agent');
    expect(output).toContain('Version: 5');
    expect(output).toContain('Description: Custom description here');
  });

  it('escapes template literal characters in system prompt', () => {
    const agent = createTestAgent({
      systemPrompt: 'Use backticks `code` and ${variables} carefully',
    });
    const output = exportToTypeScript(agent);

    // Should escape backticks and dollar signs
    expect(output).toContain('\\`code\\`');
    expect(output).toContain('\\$');
  });

  it('generates tool definitions correctly', () => {
    const agent = createTestAgent();
    const output = exportToTypeScript(agent);

    // Check tool name
    expect(output).toContain("name: 'search_web'");
    expect(output).toContain("name: 'calculate'");

    // Check tool description
    expect(output).toContain('Search the web for information');

    // Check parameter schema
    expect(output).toContain("type: 'object' as const");
    expect(output).toContain("type: 'string'");
    expect(output).toContain("type: 'number'");

    // Check required parameters
    expect(output).toContain("required: ['query']");
    expect(output).toContain("required: ['expression']");
  });

  it('generates tool handler switch cases', () => {
    const agent = createTestAgent();
    const output = exportToTypeScript(agent);

    expect(output).toContain("case 'search_web':");
    expect(output).toContain("case 'calculate':");
    expect(output).toContain('// TODO: Implement tool logic');
  });

  it('uses the agent model', () => {
    const agent = createTestAgent({
      parameters: {
        model: 'claude-opus-4-20250514',
        temperature: 0.5,
        maxTokens: 4096,
      },
    });
    const output = exportToTypeScript(agent);

    expect(output).toContain("const MODEL = 'claude-opus-4-20250514'");
    expect(output).toContain('const MAX_TOKENS = 4096');
  });

  it('handles agents with no tools', () => {
    const agent = createTestAgent({ tools: [] });
    const output = exportToTypeScript(agent);

    expect(output).toContain('const tools: Anthropic.Tool[] = [');
    // Should have an empty tools array (just whitespace between brackets)
    expect(output).toMatch(/const tools: Anthropic\.Tool\[\] = \[\s*\]/);
  });

  it('escapes single quotes in descriptions', () => {
    const agent = createTestAgent({
      tools: [
        {
          id: 't1',
          name: 'test',
          description: "It's a test tool",
          type: 'builtin',
          config: { builtinName: 'test' },
          parameters: [
            { name: 'arg', type: 'string', description: "User's input", required: true },
          ],
        },
      ],
    });
    const output = exportToTypeScript(agent);

    expect(output).toContain("\\'s");
  });
});

describe('exportToJson', () => {
  it('generates valid JSON', () => {
    const agent = createTestAgent();
    const output = exportToJson(agent);

    // Should not throw
    const parsed = JSON.parse(output);
    expect(parsed).toBeDefined();
  });

  it('includes all required fields', () => {
    const agent = createTestAgent();
    const output = exportToJson(agent);
    const parsed = JSON.parse(output) as JsonExportData;

    expect(parsed.name).toBe('Test Agent');
    expect(parsed.version).toBe(3);
    expect(parsed.description).toBe('A test agent for unit testing');
    expect(parsed.systemPrompt).toBe(agent.systemPrompt);
    expect(parsed.tools).toHaveLength(2);
    expect(parsed.flow).toEqual([]);
    expect(parsed.memory).toEqual({ type: 'none', config: {} });
    expect(parsed.parameters).toEqual(agent.parameters);
  });

  it('formats tools correctly', () => {
    const agent = createTestAgent();
    const output = exportToJson(agent);
    const parsed = JSON.parse(output) as JsonExportData;

    const searchTool = parsed.tools[0];
    expect(searchTool.name).toBe('search_web');
    expect(searchTool.description).toBe('Search the web for information');
    expect(searchTool.type).toBe('builtin');
    expect(searchTool.parameters).toHaveLength(2);
    expect(searchTool.parameters[0].required).toBe(true);
    expect(searchTool.parameters[1].required).toBe(false);
  });

  it('pretty prints with 2-space indentation', () => {
    const agent = createTestAgent();
    const output = exportToJson(agent);

    // Check for indentation (2 spaces)
    expect(output).toContain('  "name"');
    expect(output).toContain('    "name"'); // Nested indentation for tool properties
  });

  it('handles special characters in strings', () => {
    const agent = createTestAgent({
      systemPrompt: 'Use "quotes" and newlines\nhere',
      description: 'Tab\there',
    });
    const output = exportToJson(agent);

    // Should be valid JSON despite special chars
    const parsed = JSON.parse(output) as JsonExportData;
    expect(parsed.systemPrompt).toContain('"quotes"');
    expect(parsed.systemPrompt).toContain('\n');
    expect(parsed.description).toContain('\t');
  });

  it('excludes internal fields like id and timestamps', () => {
    const agent = createTestAgent();
    const output = exportToJson(agent);
    const parsed = JSON.parse(output) as JsonExportData;

    // These should not be in the export
    expect((parsed as unknown as Record<string, unknown>)['id']).toBeUndefined();
    expect((parsed as unknown as Record<string, unknown>)['createdAt']).toBeUndefined();
    expect((parsed as unknown as Record<string, unknown>)['updatedAt']).toBeUndefined();
  });
});

describe('exportToPython', () => {
  it('generates valid Python code structure', () => {
    const agent = createTestAgent();
    const output = exportToPython(agent);

    // Check for shebang and docstring
    expect(output).toContain('#!/usr/bin/env python3');
    expect(output).toContain('"""');

    // Check for imports
    expect(output).toContain('from typing import Any, Optional');
    expect(output).toContain('from langchain_openai import ChatOpenAI');
    expect(output).toContain('from langchain.agents import AgentExecutor');
    expect(output).toContain('from langchain_core.tools import tool');

    // Check for system prompt
    expect(output).toContain('SYSTEM_PROMPT = """');

    // Check for tool decorators
    expect(output).toContain('@tool');

    // Check for agent creation function
    expect(output).toContain('def create_agent(');
    expect(output).toContain('-> AgentExecutor:');

    // Check for main entry point
    expect(output).toContain('if __name__ == "__main__"');
    expect(output).toContain('async def main()');
  });

  it('includes agent metadata in docstring', () => {
    const agent = createTestAgent({
      name: 'Python Test Agent',
      version: 7,
      description: 'Agent for Python testing',
    });
    const output = exportToPython(agent);

    expect(output).toContain('Agent: Python Test Agent');
    expect(output).toContain('Version: 7');
    expect(output).toContain('Description: Agent for Python testing');
  });

  it('escapes triple quotes in system prompt', () => {
    const agent = createTestAgent({
      systemPrompt: 'Use """triple quotes""" carefully',
    });
    const output = exportToPython(agent);

    // Should escape triple quotes
    expect(output).toContain('\\"\\"\\"');
  });

  it('generates tool functions with correct signatures', () => {
    const agent = createTestAgent();
    const output = exportToPython(agent);

    // Check function signature with type hints
    expect(output).toContain('def search_web(query: str, limit: float = None)');
    expect(output).toContain('def calculate(expression: str)');

    // Check return type
    expect(output).toContain('-> str:');

    // Check docstrings
    expect(output).toContain('"""Search the web for information');
    expect(output).toContain('Args:');
    expect(output).toContain('Returns:');
  });

  it('converts JS types to Python types', () => {
    const agent = createTestAgent({
      tools: [
        {
          id: 't1',
          name: 'test_types',
          description: 'Test type conversion',
          type: 'builtin',
          config: { builtinName: 'test_types' },
          parameters: [
            { name: 'str_param', type: 'string', description: 'String param', required: true },
            { name: 'num_param', type: 'number', description: 'Number param', required: true },
            { name: 'int_param', type: 'integer', description: 'Integer param', required: true },
            { name: 'bool_param', type: 'boolean', description: 'Boolean param', required: true },
            { name: 'obj_param', type: 'object', description: 'Object param', required: false },
            { name: 'arr_param', type: 'array', description: 'Array param', required: false },
          ],
        },
      ],
    });
    const output = exportToPython(agent);

    expect(output).toContain('str_param: str');
    expect(output).toContain('num_param: float');
    expect(output).toContain('int_param: int');
    expect(output).toContain('bool_param: bool');
    expect(output).toContain('obj_param: dict = None');
    expect(output).toContain('arr_param: list = None');
  });

  it('includes agent parameters in create_agent function', () => {
    const agent = createTestAgent({
      parameters: {
        model: 'gpt-4',
        temperature: 0.5,
        maxTokens: 4096,
      },
    });
    const output = exportToPython(agent);

    expect(output).toContain('model_name: str = "gpt-4"');
    expect(output).toContain('temperature: float = 0.5');
    expect(output).toContain('max_tokens: int = 4096');
  });

  it('handles agents with no tools', () => {
    const agent = createTestAgent({ tools: [] });
    const output = exportToPython(agent);

    // Should still have valid structure
    expect(output).toContain('tools = []');
    expect(output).not.toContain('@tool');
  });

  it('uses gpt-4 fallback for non-OpenAI models', () => {
    const agent = createTestAgent({
      parameters: {
        model: 'claude-sonnet-4-20250514',
        temperature: 0.7,
        maxTokens: 2048,
      },
    });
    const output = exportToPython(agent);

    // Should fall back to gpt-4 since LangChain uses OpenAI
    expect(output).toContain('model_name: str = "gpt-4"');
  });

  it('preserves OpenAI model names', () => {
    const agent = createTestAgent({
      parameters: {
        model: 'gpt-4-turbo',
        temperature: 0.7,
        maxTokens: 2048,
      },
    });
    const output = exportToPython(agent);

    expect(output).toContain('model_name: str = "gpt-4-turbo"');
  });
});
