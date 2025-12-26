// LiteLLM API Client

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

class LLMClient {
  private baseUrl: string;
  private apiKey: string;
  private model: string;

  constructor() {
    this.baseUrl = import.meta.env.VITE_LITELLM_API_BASE || '';
    this.apiKey = import.meta.env.VITE_LITELLM_API_KEY || '';
    this.model = import.meta.env.VITE_LITELLM_MODEL || 'azure/gpt-4o-mini';

    if (!this.baseUrl || !this.apiKey) {
      console.warn('LLM API not configured. Set VITE_LITELLM_API_BASE and VITE_LITELLM_API_KEY in .env');
    }
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  async chat(
    messages: ChatMessage[],
    options: { maxTokens?: number; temperature?: number } = {}
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('LLM API not configured. Check environment variables.');
    }

    const request: ChatCompletionRequest = {
      model: this.model,
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
    options: { maxTokens?: number; temperature?: number } = {}
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
export async function generateText(prompt: string, options?: { maxTokens?: number; temperature?: number }): Promise<string> {
  return llmClient.chat([{ role: 'user', content: prompt }], options);
}

export async function generateWithSystem(
  systemPrompt: string,
  userPrompt: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  return llmClient.generateWithSystemPrompt(systemPrompt, userPrompt, options);
}

export function isLLMConfigured(): boolean {
  return llmClient.isConfigured();
}
