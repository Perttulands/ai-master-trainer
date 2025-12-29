/**
 * LLM Debug Types
 *
 * Type definitions for capturing and displaying LLM call debug information.
 * Used to troubleshoot API errors by showing exact request/response data.
 */

export interface LLMDebugEntry {
  id: string;
  timestamp: number;

  // Request details
  request: {
    model: string;
    messages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }>;
    maxTokens: number;
    temperature: number;
    topP?: number;
  };

  // Response details (if success)
  response?: {
    content: string;
    finishReason: string;
    model: string; // actual model used (may differ from requested)
  };

  // Token usage
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };

  // Timing
  durationMs: number;

  // Error details (if failed)
  error?: {
    message: string;
    type?: string;
    code?: string;
    rawResponse?: string; // raw error body for debugging
    stack?: string;
  };

  // Status
  status: 'success' | 'error';

  // Session context for filtering
  sessionId?: string;
}

export type LLMDebugFilter = 'all' | 'success' | 'error';
