/**
 * LLM Client Tests
 *
 * Tests for the LiteLLM API client that handles all LLM interactions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock environment variables
vi.stubEnv('VITE_LITELLM_API_BASE', 'https://api.test.com');
vi.stubEnv('VITE_LITELLM_API_KEY', 'test-api-key');
vi.stubEnv('VITE_LITELLM_MODEL', 'test-model');

// Mock the model store
vi.mock('../../store/model', () => ({
  useModelStore: {
    getState: vi.fn(() => ({
      trainerModelId: 'trainer-model',
      agentModelId: 'agent-model',
    })),
  },
}));

describe('LLM Client', () => {
  let llmClient: typeof import('../llm').llmClient;
  let generateText: typeof import('../llm').generateText;
  let generateWithSystem: typeof import('../llm').generateWithSystem;
  let isLLMConfigured: typeof import('../llm').isLLMConfigured;
  let getTrainerModelId: typeof import('../llm').getTrainerModelId;
  let getAgentModelId: typeof import('../llm').getAgentModelId;

  beforeEach(async () => {
    vi.resetModules();
    mockFetch.mockReset();
    const module = await import('../llm');
    llmClient = module.llmClient;
    generateText = module.generateText;
    generateWithSystem = module.generateWithSystem;
    isLLMConfigured = module.isLLMConfigured;
    getTrainerModelId = module.getTrainerModelId;
    getAgentModelId = module.getAgentModelId;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('isLLMConfigured', () => {
    it('returns true when API base and key are set', () => {
      expect(isLLMConfigured()).toBe(true);
    });
  });

  describe('llmClient.chat', () => {
    it('makes POST request to correct endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'test-id',
            choices: [{ message: { content: 'Test response' } }],
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          }),
      });

      await llmClient.chat([{ role: 'user', content: 'Hello' }]);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-api-key',
          }),
        })
      );
    });

    it('includes messages in request body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'test-id',
            choices: [{ message: { content: 'Response' } }],
            usage: {},
          }),
      });

      await llmClient.chat([
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' },
      ]);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.messages).toEqual([
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' },
      ]);
    });

    it('uses trainer model from store by default', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'test-id',
            choices: [{ message: { content: 'Response' } }],
            usage: {},
          }),
      });

      await llmClient.chat([{ role: 'user', content: 'Hello' }]);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.model).toBe('trainer-model');
    });

    it('allows model override via options', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'test-id',
            choices: [{ message: { content: 'Response' } }],
            usage: {},
          }),
      });

      await llmClient.chat([{ role: 'user', content: 'Hello' }], {
        model: 'custom-model',
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.model).toBe('custom-model');
    });

    it('includes maxTokens in request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'test-id',
            choices: [{ message: { content: 'Response' } }],
            usage: {},
          }),
      });

      await llmClient.chat([{ role: 'user', content: 'Hello' }], {
        maxTokens: 2048,
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.max_tokens).toBe(2048);
    });

    it('includes temperature in request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'test-id',
            choices: [{ message: { content: 'Response' } }],
            usage: {},
          }),
      });

      await llmClient.chat([{ role: 'user', content: 'Hello' }], {
        temperature: 0.5,
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.temperature).toBe(0.5);
    });

    it('uses default maxTokens when not specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'test-id',
            choices: [{ message: { content: 'Response' } }],
            usage: {},
          }),
      });

      await llmClient.chat([{ role: 'user', content: 'Hello' }]);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.max_tokens).toBe(1024);
    });

    it('uses default temperature when not specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'test-id',
            choices: [{ message: { content: 'Response' } }],
            usage: {},
          }),
      });

      await llmClient.chat([{ role: 'user', content: 'Hello' }]);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.temperature).toBe(0.7);
    });

    it('returns content from response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'test-id',
            choices: [{ message: { content: 'Generated text here' } }],
            usage: {},
          }),
      });

      const result = await llmClient.chat([{ role: 'user', content: 'Hello' }]);

      expect(result).toBe('Generated text here');
    });

    it('throws error on HTTP error response', async () => {
      const errorResponse = JSON.stringify({
        error: {
          message: 'Invalid request',
          type: 'invalid_request_error',
          code: 'invalid_api_key',
        },
      });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve(errorResponse),
      });

      await expect(
        llmClient.chat([{ role: 'user', content: 'Hello' }])
      ).rejects.toThrow('Invalid request');
    });

    it('throws error when no choices returned', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'test-id',
            choices: [],
            usage: {},
          }),
      });

      await expect(
        llmClient.chat([{ role: 'user', content: 'Hello' }])
      ).rejects.toThrow('No response from LLM');
    });

    it('throws error when choices is missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'test-id',
            usage: {},
          }),
      });

      await expect(
        llmClient.chat([{ role: 'user', content: 'Hello' }])
      ).rejects.toThrow('No response from LLM');
    });

    it('handles network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        llmClient.chat([{ role: 'user', content: 'Hello' }])
      ).rejects.toThrow('Network error');
    });
  });

  describe('llmClient.generateWithSystemPrompt', () => {
    it('combines system and user prompts', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'test-id',
            choices: [{ message: { content: 'Response' } }],
            usage: {},
          }),
      });

      await llmClient.generateWithSystemPrompt(
        'You are an expert',
        'Help me with this'
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.messages).toEqual([
        { role: 'system', content: 'You are an expert' },
        { role: 'user', content: 'Help me with this' },
      ]);
    });

    it('passes options through', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'test-id',
            choices: [{ message: { content: 'Response' } }],
            usage: {},
          }),
      });

      await llmClient.generateWithSystemPrompt('System', 'User', {
        maxTokens: 500,
        temperature: 0.3,
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.max_tokens).toBe(500);
      expect(callBody.temperature).toBe(0.3);
    });
  });

  describe('generateText convenience function', () => {
    it('sends user message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'test-id',
            choices: [{ message: { content: 'Response' } }],
            usage: {},
          }),
      });

      await generateText('Hello world');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.messages).toEqual([{ role: 'user', content: 'Hello world' }]);
    });
  });

  describe('generateWithSystem convenience function', () => {
    it('delegates to llmClient.generateWithSystemPrompt', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'test-id',
            choices: [{ message: { content: 'Response' } }],
            usage: {},
          }),
      });

      await generateWithSystem('System prompt', 'User prompt');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.messages[0].role).toBe('system');
      expect(callBody.messages[1].role).toBe('user');
    });
  });

  describe('getTrainerModelId', () => {
    it('returns trainer model from store', () => {
      expect(getTrainerModelId()).toBe('trainer-model');
    });
  });

  describe('getAgentModelId', () => {
    it('returns agent model from store', () => {
      expect(getAgentModelId()).toBe('agent-model');
    });
  });
});

describe('LLM Client (unconfigured)', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_LITELLM_API_BASE', '');
    vi.stubEnv('VITE_LITELLM_API_KEY', '');
  });

  it('isLLMConfigured returns false when not configured', async () => {
    const { isLLMConfigured } = await import('../llm');
    expect(isLLMConfigured()).toBe(false);
  });

  it('chat throws when not configured', async () => {
    const { llmClient } = await import('../llm');
    await expect(
      llmClient.chat([{ role: 'user', content: 'Hello' }])
    ).rejects.toThrow('LLM API not configured');
  });
});
