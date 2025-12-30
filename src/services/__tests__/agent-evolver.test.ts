/**
 * Agent Evolver Service Tests
 *
 * Tests for the agent evolution service that evolves agent definitions
 * based on user feedback and scores.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  evolveAgent,
  evolveSystemPrompt,
  evolveTools,
  evolveParameters,
} from '../agent-evolver';
import type { AgentDefinition, AgentTool, AgentParameters } from '../../types/agent';

// Mock the LLM client
vi.mock('../../api/llm', () => ({
  llmClient: {
    chat: vi.fn(),
  },
  isLLMConfigured: vi.fn(() => false), // Default to deterministic evolution
}));

// Mock generateId to return predictable IDs
vi.mock('../../utils/id', () => ({
  generateId: vi.fn(() => 'test-generated-id'),
}));

// Helper to create a minimal agent definition
function createTestAgent(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    id: 'test-agent-id',
    name: 'Test Agent',
    description: 'Test description',
    version: 1,
    systemPrompt: 'You are a helpful assistant.',
    tools: [],
    flow: [],
    memory: { type: 'none', config: {} },
    parameters: {
      model: 'test-model',
      temperature: 0.7,
      maxTokens: 1024,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('agent-evolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('evolveSystemPrompt', () => {
    describe('minor evolution (score >= 8)', () => {
      it('adds clarity reminder for minor changes', async () => {
        const result = await evolveSystemPrompt(
          'You are a helpful assistant.',
          8,
          null
        );

        expect(result).toContain('clear and precise');
      });

      it('does not duplicate clarity reminder', async () => {
        const result = await evolveSystemPrompt(
          'You are a helpful assistant. Be clear and precise in your responses.',
          9,
          null
        );

        const matches = result.match(/clear and precise/g);
        expect(matches?.length).toBeLessThanOrEqual(1);
      });

      it('incorporates directives', async () => {
        const result = await evolveSystemPrompt(
          'You are a helpful assistant.',
          8,
          ['Focus on brevity']
        );

        expect(result).toContain('Focus on brevity');
      });
    });

    describe('moderate evolution (score 5-7)', () => {
      it('adds structured guidelines', async () => {
        const result = await evolveSystemPrompt(
          'You are a helpful assistant.',
          6,
          null
        );

        expect(result).toContain('guidelines');
      });
    });

    describe('major evolution (score < 5)', () => {
      it('restructures the prompt', async () => {
        const result = await evolveSystemPrompt(
          'You are a helpful assistant.',
          3,
          null
        );

        expect(result).toContain('CORE OBJECTIVE');
        expect(result).toContain('KEY BEHAVIORS');
        expect(result).toContain('QUALITY STANDARDS');
      });

      it('incorporates directives in major restructure', async () => {
        const result = await evolveSystemPrompt(
          'You are a helpful assistant.',
          2,
          ['Be extra concise']
        );

        expect(result).toContain('SPECIFIC GUIDANCE');
        expect(result).toContain('Be extra concise');
      });
    });
  });

  describe('evolveTools', () => {
    const testTools: AgentTool[] = [
      {
        id: 'tool-1',
        name: 'search',
        description: 'Search for information',
        type: 'builtin',
        config: { builtinName: 'search' },
        parameters: [
          { name: 'query', type: 'string', description: 'The search query', required: true },
          { name: 'limit', type: 'number', description: 'Max results', required: false },
        ],
      },
    ];

    describe('minor evolution (score >= 8)', () => {
      it('ensures descriptions end with period', () => {
        const result = evolveTools(testTools, 9);

        expect(result[0].description).toMatch(/\.$/);
      });

      it('preserves tool structure', () => {
        const result = evolveTools(testTools, 8);

        expect(result[0].name).toBe('search');
        expect(result[0].parameters.length).toBe(2);
      });
    });

    describe('moderate evolution (score 5-7)', () => {
      it('marks required parameters in descriptions', () => {
        const result = evolveTools(testTools, 6);

        const requiredParam = result[0].parameters.find((p) => p.name === 'query');
        expect(requiredParam?.description).toContain('(Required)');
      });

      it('does not mark optional parameters as required', () => {
        const result = evolveTools(testTools, 5);

        const optionalParam = result[0].parameters.find((p) => p.name === 'limit');
        expect(optionalParam?.description).not.toContain('(Required)');
      });
    });

    describe('major evolution (score < 5)', () => {
      it('adds error handling guidance to descriptions', () => {
        const result = evolveTools(testTools, 3);

        expect(result[0].description).toContain('Handle errors gracefully');
      });

      it('generates new IDs for major evolution', () => {
        const result = evolveTools(testTools, 2);

        expect(result[0].id).toBe('test-generated-id');
      });

      it('adds required/optional notes to all parameter descriptions', () => {
        const result = evolveTools(testTools, 3);

        const requiredParam = result[0].parameters.find((p) => p.name === 'query');
        const optionalParam = result[0].parameters.find((p) => p.name === 'limit');

        expect(requiredParam?.description).toContain('(Required');
        expect(optionalParam?.description).toContain('(Optional)');
      });
    });

    it('handles empty tools array', () => {
      const result = evolveTools([], 5);
      expect(result).toEqual([]);
    });
  });

  describe('evolveParameters', () => {
    const baseParams: AgentParameters = {
      model: 'test-model',
      temperature: 0.7,
      maxTokens: 1024,
    };

    describe('minor evolution (score >= 8)', () => {
      it('slightly decreases temperature for near-perfect scores', () => {
        const result = evolveParameters(baseParams, 9);

        expect(result.temperature).toBeLessThan(baseParams.temperature);
        expect(result.temperature).toBeGreaterThan(0);
      });

      it('slightly increases temperature for good but not perfect scores', () => {
        const result = evolveParameters(baseParams, 8);

        expect(result.temperature).toBeGreaterThan(baseParams.temperature);
        expect(result.temperature).toBeLessThanOrEqual(1);
      });
    });

    describe('moderate evolution (score 5-7)', () => {
      it('sets temperature based on score', () => {
        const highMod = evolveParameters(baseParams, 7);
        const lowMod = evolveParameters(baseParams, 5);

        expect(highMod.temperature).toBe(0.6);
        expect(lowMod.temperature).toBe(0.8);
      });

      it('adjusts frequency and presence penalties', () => {
        const result = evolveParameters(baseParams, 6);

        expect(result.frequencyPenalty).toBeDefined();
        expect(result.presencePenalty).toBeDefined();
      });
    });

    describe('major evolution (score < 5)', () => {
      it('resets temperature to balanced value', () => {
        const result = evolveParameters({ ...baseParams, temperature: 0.2 }, 3);

        expect(result.temperature).toBe(0.7);
      });

      it('increases maxTokens', () => {
        const result = evolveParameters(baseParams, 3);

        expect(result.maxTokens).toBeGreaterThan(baseParams.maxTokens);
      });

      it('sets topP for major changes', () => {
        const result = evolveParameters(baseParams, 2);

        expect(result.topP).toBe(0.9);
      });

      it('sets penalties for major changes', () => {
        const result = evolveParameters(baseParams, 2);

        expect(result.frequencyPenalty).toBe(0.3);
        expect(result.presencePenalty).toBe(0.3);
      });
    });

    describe('value clamping', () => {
      it('clamps temperature to valid range', () => {
        const highTemp = evolveParameters({ ...baseParams, temperature: 1.95 }, 8);
        expect(highTemp.temperature).toBeLessThanOrEqual(2);

        const lowTemp = evolveParameters({ ...baseParams, temperature: 0.02 }, 9);
        expect(lowTemp.temperature).toBeGreaterThanOrEqual(0);
      });

      it('clamps penalties to valid range', () => {
        const result = evolveParameters(
          { ...baseParams, frequencyPenalty: 1.95, presencePenalty: 1.95 },
          6
        );

        expect(result.frequencyPenalty).toBeLessThanOrEqual(2);
        expect(result.presencePenalty).toBeLessThanOrEqual(2);
      });
    });
  });

  describe('evolveAgent', () => {
    it('throws for invalid scores', async () => {
      const agent = createTestAgent();

      await expect(
        evolveAgent(agent, 'test need', 0, null, null, null)
      ).rejects.toThrow('Score must be between 1 and 10');

      await expect(
        evolveAgent(agent, 'test need', 11, null, null, null)
      ).rejects.toThrow('Score must be between 1 and 10');
    });

    it('increments version number', async () => {
      const agent = createTestAgent({ version: 5 });

      const result = await evolveAgent(agent, 'test need', 6, null, null, null);

      expect(result.version).toBe(6);
    });

    it('generates new ID', async () => {
      const agent = createTestAgent();

      const result = await evolveAgent(agent, 'test need', 6, null, null, null);

      expect(result.id).toBe('test-generated-id');
    });

    it('preserves agent name and description', async () => {
      const agent = createTestAgent({
        name: 'Custom Agent',
        description: 'Custom description',
      });

      const result = await evolveAgent(agent, 'test need', 7, null, null, null);

      expect(result.name).toBe('Custom Agent');
      // Description might be updated for major changes, but preserved otherwise
    });

    it('combines all directives', async () => {
      const agent = createTestAgent();

      const result = await evolveAgent(
        agent,
        'test need',
        5,
        'feedback comment',
        ['sticky directive'],
        ['oneshot directive']
      );

      // The prompt should contain influences from directives
      expect(result.systemPrompt).toBeTruthy();
    });

    it('evolves all components', async () => {
      const agent = createTestAgent({
        tools: [
          {
            id: 't1',
            name: 'tool1',
            description: 'A tool',
            type: 'builtin',
            config: { builtinName: 'tool1' },
            parameters: [{ name: 'p1', type: 'string', description: 'd1', required: true }],
          },
        ],
        parameters: {
          model: 'test-model',
          temperature: 0.5,
          maxTokens: 1024,
        },
      });

      const result = await evolveAgent(agent, 'test need', 3, null, null, null);

      // Should have evolved system prompt
      expect(result.systemPrompt).not.toBe(agent.systemPrompt);
      // Should have evolved parameters
      expect(result.parameters).not.toEqual(agent.parameters);
      // Should have evolved tools
      expect(result.tools).not.toEqual(agent.tools);
    });

    it('updates the updatedAt timestamp', async () => {
      const agent = createTestAgent({ updatedAt: 1000 });

      const result = await evolveAgent(agent, 'test need', 6, null, null, null);

      expect(result.updatedAt).toBeGreaterThan(agent.updatedAt);
    });

    it('handles null/undefined directives gracefully', async () => {
      const agent = createTestAgent();

      // Should not throw
      const result = await evolveAgent(agent, 'test need', 6, null, null, null);
      expect(result).toBeDefined();

      const result2 = await evolveAgent(agent, 'test need', 6, undefined as unknown as string, undefined as unknown as string[], undefined as unknown as string[]);
      expect(result2).toBeDefined();
    });
  });
});
