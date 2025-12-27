// LiteLLM API Client
// Supports dynamic model selection via the model store

import { useModelStore } from '../store/model';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
}

interface ChatCompletionChoice {
  index: number;
  message: {
    role: string;
    content: string;
  };
  finish_reason: string;
}

interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface LLMError {
  error: {
    message: string;
    type: string;
    code: string;
  };
}

interface ChatOptions {
  maxTokens?: number;
  temperature?: number;
  model?: string; // Override the default model
}

class LLMClient {
  private baseUrl: string;
  private apiKey: string;
  private defaultModel: string;

  constructor() {
    this.baseUrl = import.meta.env.VITE_LITELLM_API_BASE || '';
    this.apiKey = import.meta.env.VITE_LITELLM_API_KEY || '';
    this.defaultModel = import.meta.env.VITE_LITELLM_MODEL || 'anthropic/claude-4-5-sonnet-aws';

    if (!this.baseUrl || !this.apiKey) {
      console.warn('LLM API not configured. Set VITE_LITELLM_API_BASE and VITE_LITELLM_API_KEY in .env');
    }
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  // Get the current model from the store or fall back to default
  private getCurrentModel(): string {
    try {
      // Access the store state directly (non-React context)
      const state = useModelStore.getState();
      return state.selectedModelId || this.defaultModel;
    } catch {
      return this.defaultModel;
    }
  }

  async chat(
    messages: ChatMessage[],
    options: ChatOptions = {}
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('LLM API not configured. Check environment variables.');
    }

    // Use provided model, or get from store, or use default
    const model = options.model || this.getCurrentModel();

    const request: ChatCompletionRequest = {
      model,
      messages,
      max_tokens: options.maxTokens || 1024,
      temperature: options.temperature ?? 0.7,
    };

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json() as LLMError;
        throw new Error(errorData.error?.message || `API error: ${response.status}`);
      }

      const data = await response.json() as ChatCompletionResponse;

      if (!data.choices || data.choices.length === 0) {
        throw new Error('No response from LLM');
      }

      return data.choices[0].message.content;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Unknown error during LLM request');
    }
  }

  async generateWithSystemPrompt(
    systemPrompt: string,
    userPrompt: string,
    options: ChatOptions = {}
  ): Promise<string> {
    return this.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      options
    );
  }
}

// Singleton instance
export const llmClient = new LLMClient();

// Convenience functions
export async function generateText(
  prompt: string,
  options?: ChatOptions
): Promise<string> {
  return llmClient.chat([{ role: 'user', content: prompt }], options);
}

export async function generateWithSystem(
  systemPrompt: string,
  userPrompt: string,
  options?: ChatOptions
): Promise<string> {
  return llmClient.generateWithSystemPrompt(systemPrompt, userPrompt, options);
}

export function isLLMConfigured(): boolean {
  return llmClient.isConfigured();
}

// Get current model info
export function getCurrentModelId(): string {
  try {
    return useModelStore.getState().selectedModelId;
  } catch {
    return import.meta.env.VITE_LITELLM_MODEL || 'anthropic/claude-4-5-sonnet-aws';
  }
}
