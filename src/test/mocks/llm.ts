import { vi } from 'vitest';

/**
 * Mock LLM responses for testing
 */
export const mockLLMResponses = {
  // Initial agent generation response
  agentGeneration: (label: string, need: string) => `
Based on the need "${need}", here is a ${label} approach:

This is a generated artifact demonstrating the ${label} strategy.
The content is tailored to address your specific requirements.
`,

  // Agent execution response
  agentExecution: (agentName: string, input: string) => `
[Agent: ${agentName}]
Processing input: ${input}

Generated output based on agent configuration.
This demonstrates the agent's capability to process requests.
`,

  // Agent evolution response
  agentEvolution: (originalPrompt: string, score: number) => {
    if (score >= 8) {
      return `${originalPrompt}\n\n[Refined for quality: Minor polish applied]`;
    } else if (score >= 5) {
      return `${originalPrompt}\n\n[Improved: Moderate enhancements applied]`;
    } else {
      return `[Significantly revised approach]\n\n${originalPrompt.split('.')[0]}. Taking a different direction based on feedback.`;
    }
  },

  // Strategy proposal response
  strategyProposal: (need: string) => ({
    A: {
      tag: 'Concise',
      description: `Brief, focused approach for: ${need}`,
    },
    B: {
      tag: 'Detailed',
      description: `Comprehensive coverage for: ${need}`,
    },
    C: {
      tag: 'Creative',
      description: `Innovative approach for: ${need}`,
    },
    D: {
      tag: 'Analytical',
      description: `Structured analysis for: ${need}`,
    },
  }),

  // Chat response
  chatResponse: (message: string) =>
    `I understand you're asking about "${message}". Here's my guidance as the Master Trainer...`,
};

/**
 * Create a mock for the LLM API module
 */
export function createLLMMock() {
  return {
    generateWithSystem: vi.fn(
      async (systemPrompt: string, userPrompt: string) => {
        // Return mock response based on prompt content
        if (userPrompt.includes('Generate content')) {
          return mockLLMResponses.agentGeneration('A', userPrompt);
        }
        if (userPrompt.includes('evolve') || userPrompt.includes('improve')) {
          return mockLLMResponses.agentEvolution(systemPrompt, 7);
        }
        return mockLLMResponses.chatResponse(userPrompt);
      }
    ),

    isLLMConfigured: vi.fn(() => true),

    generateWithMessages: vi.fn(async () => 'Mock response'),

    getLLMStatus: vi.fn(() => ({
      isConfigured: true,
      provider: 'mock',
      model: 'mock-model',
    })),
  };
}

/**
 * Setup LLM mock for tests
 */
export function setupLLMMock() {
  const mock = createLLMMock();

  vi.mock('@/api/llm', () => mock);
  vi.mock('../../api/llm', () => mock);
  vi.mock('../api/llm', () => mock);

  return mock;
}
