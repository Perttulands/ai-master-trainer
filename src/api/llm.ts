/**
 * LiteLLM API Client
 *
 * This is the RUNTIME LLM gateway for Training Camp.
 * ALL LLM calls (trainer and agent) go through this client via LiteLLM.
 *
 * LiteLLM provides:
 * - Multi-model support (Claude, GPT, Gemini, etc.)
 * - Unified API format
 * - Model routing via model IDs like 'anthropic/claude-4-5-sonnet-aws'
 *
 * Two model selections:
 * - Trainer Model (trainerModelId): Used for evolution, analysis, planning
 * - Agent Model (agentModelId): Used by generated agents for artifact production
 *
 * DO NOT use the Anthropic SDK directly for runtime execution.
 * See: src/lib/export/to-typescript.ts for Anthropic SDK export (standalone code generation only)
 */

import { useModelStore } from "../store/model";
import { useLLMDebugStore, generateDebugId } from "../store/llm-debug";
import type { LLMDebugEntry } from "../types/llm-debug";

interface ChatMessage {
  role: "system" | "user" | "assistant";
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
  sessionId?: string; // For debug filtering
}

class LLMClient {
  private baseUrl: string;
  private defaultModel: string;

  constructor() {
    this.baseUrl = import.meta.env.VITE_LITELLM_API_BASE || "";
    this.defaultModel =
      import.meta.env.VITE_LITELLM_MODEL || "anthropic/claude-4-5-sonnet-aws";
  }

  private getApiKey(): string | null {
    // 1. Try store (user provided)
    try {
      const state = useModelStore.getState();
      if (state.apiKey) return state.apiKey;
    } catch {
      // Store not initialized
    }

    // 2. Try env var (dev/deployment provided)
    return import.meta.env.VITE_LITELLM_API_KEY || null;
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.getApiKey());
  }

  // Get the trainer model from the store (used for evolution, analysis, planning)
  private getTrainerModel(): string {
    try {
      // Access the store state directly (non-React context)
      const state = useModelStore.getState();
      return state.trainerModelId || this.defaultModel;
    } catch {
      return this.defaultModel;
    }
  }

  async chat(
    messages: ChatMessage[],
    options: ChatOptions = {}
  ): Promise<string> {
    // Use provided model, or get trainer model from store, or use default
    const model = options.model || this.getTrainerModel();

    // Handle Mock Model
    if (model === "mock/demo") {
      return this.handleMockRequest(messages);
    }

    const apiKey = this.getApiKey();
    if (!this.baseUrl || !apiKey) {
      throw new Error("LLM API not configured. Please add an API key.");
    }

    const startTime = Date.now();
    const debugId = generateDebugId();

    const request: ChatCompletionRequest = {
      model,
      messages,
      max_tokens: options.maxTokens || 1024,
      temperature: options.temperature ?? 0.7,
    };

    // Build base debug entry
    const baseDebugEntry: Omit<LLMDebugEntry, "status" | "durationMs"> = {
      id: debugId,
      timestamp: startTime,
      request: {
        model: request.model,
        messages: request.messages,
        maxTokens: request.max_tokens || 1024,
        temperature: request.temperature ?? 0.7,
      },
      sessionId: options.sessionId,
    };

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(request),
      });

      const durationMs = Date.now() - startTime;

      if (!response.ok) {
        // Try to get raw response for debugging
        let rawResponse: string | undefined;
        let errorData: LLMError | undefined;
        try {
          rawResponse = await response.text();
          errorData = JSON.parse(rawResponse) as LLMError;
        } catch {
          // Response wasn't JSON
        }

        const errorMessage =
          errorData?.error?.message || `API error: ${response.status}`;

        // Log error to debug store
        useLLMDebugStore.getState().addEntry({
          ...baseDebugEntry,
          durationMs,
          status: "error",
          error: {
            message: errorMessage,
            type: errorData?.error?.type,
            code: errorData?.error?.code || String(response.status),
            rawResponse,
          },
        });

        throw new Error(errorMessage);
      }

      const data = (await response.json()) as ChatCompletionResponse;

      if (!data.choices || data.choices.length === 0) {
        // Log empty response as error
        useLLMDebugStore.getState().addEntry({
          ...baseDebugEntry,
          durationMs,
          status: "error",
          error: {
            message: "No response from LLM",
            type: "empty_response",
          },
        });
        throw new Error("No response from LLM");
      }

      // Log success to debug store
      useLLMDebugStore.getState().addEntry({
        ...baseDebugEntry,
        durationMs,
        status: "success",
        response: {
          content: data.choices[0].message.content,
          finishReason: data.choices[0].finish_reason,
          model: data.model,
        },
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
            }
          : undefined,
      });

      return data.choices[0].message.content;
    } catch (error) {
      const durationMs = Date.now() - startTime;

      // Only log if not already logged (check if error was thrown after logging)
      const existingEntry = useLLMDebugStore
        .getState()
        .entries.find((e) => e.id === debugId);
      if (!existingEntry) {
        useLLMDebugStore.getState().addEntry({
          ...baseDebugEntry,
          durationMs,
          status: "error",
          error: {
            message: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
          },
        });
      }

      if (error instanceof Error) {
        throw error;
      }
      throw new Error("Unknown error during LLM request");
    }
  }

  async generateWithSystemPrompt(
    systemPrompt: string,
    userPrompt: string,
    options: ChatOptions = {}
  ): Promise<string> {
    return this.chat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      options
    );
  }

  private async handleMockRequest(messages: ChatMessage[]): Promise<string> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    const lastMessage = messages[messages.length - 1].content.toLowerCase();

    if (lastMessage.includes("quantum")) {
      return "Quantum computing uses quantum mechanics to process information. Unlike classical computers that use bits (0 or 1), quantum computers use qubits which can exist in a state of superposition, representing both 0 and 1 simultaneously. This allows them to solve certain complex problems much faster.";
    }

    return "This is a simulated response from the Mock Demo model. In a real session, this would be generated by an advanced LLM based on your specific prompt and context.";
  }
}

// Singleton instance
export const llmClient = new LLMClient();

// Convenience functions
export async function generateText(
  prompt: string,
  options?: ChatOptions
): Promise<string> {
  return llmClient.chat([{ role: "user", content: prompt }], options);
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

// Get trainer model ID (for evolution, analysis, planning)
export function getTrainerModelId(): string {
  try {
    return useModelStore.getState().trainerModelId;
  } catch {
    return (
      import.meta.env.VITE_LITELLM_MODEL || "anthropic/claude-4-5-sonnet-aws"
    );
  }
}

// Get agent model ID (for generated agents that produce artifacts)
export function getAgentModelId(): string {
  try {
    return useModelStore.getState().agentModelId;
  } catch {
    return (
      import.meta.env.VITE_LITELLM_MODEL || "anthropic/claude-4-5-sonnet-aws"
    );
  }
}

// Backwards compatibility alias
export function getCurrentModelId(): string {
  return getTrainerModelId();
}
