import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  tier: 'high-end' | 'standard' | 'economy';
  description: string;
}

// Available models from LiteLLM
export const AVAILABLE_MODELS: ModelInfo[] = [
  // High-end models
  {
    id: 'anthropic/claude-4-5-sonnet-aws',
    name: 'Claude 4.5 Sonnet',
    provider: 'Anthropic',
    tier: 'high-end',
    description: 'Best for complex reasoning and nuanced content generation',
  },
  {
    id: 'azure/gpt-5-chat',
    name: 'GPT-5',
    provider: 'OpenAI',
    tier: 'high-end',
    description: 'Latest OpenAI model with advanced capabilities',
  },
  {
    id: 'google/gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'Google',
    tier: 'high-end',
    description: 'Google\'s most capable model, excellent for long context',
  },
  {
    id: 'azure/gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    tier: 'high-end',
    description: 'Fast and capable, great for most tasks',
  },
  {
    id: 'azure/o1-mini',
    name: 'o1-mini',
    provider: 'OpenAI',
    tier: 'high-end',
    description: 'Specialized for deep reasoning and complex problems',
  },
  // Standard models
  {
    id: 'azure/gpt-5-mini',
    name: 'GPT-5 Mini',
    provider: 'OpenAI',
    tier: 'standard',
    description: 'Balanced performance and cost',
  },
  {
    id: 'google/gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'Google',
    tier: 'standard',
    description: 'Fast responses with good quality',
  },
  {
    id: 'azure/gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'OpenAI',
    tier: 'standard',
    description: 'Cost-effective for simpler tasks',
  },
  // Economy models
  {
    id: 'azure/gpt-5-nano',
    name: 'GPT-5 Nano',
    provider: 'OpenAI',
    tier: 'economy',
    description: 'Fastest and most economical',
  },
  {
    id: 'google/gemini-2.0-flash-001',
    name: 'Gemini 2.0 Flash',
    provider: 'Google',
    tier: 'economy',
    description: 'Quick responses for basic tasks',
  },
];

const DEFAULT_MODEL = import.meta.env.VITE_LITELLM_MODEL || 'anthropic/claude-4-5-sonnet-aws';

interface ModelState {
  trainerModelId: string;
  agentModelId: string;
  setTrainerModel: (modelId: string) => void;
  setAgentModel: (modelId: string) => void;
  getTrainerModel: () => ModelInfo | undefined;
  getAgentModel: () => ModelInfo | undefined;
}

export const useModelStore = create<ModelState>()(
  persist(
    (set, get) => ({
      trainerModelId: DEFAULT_MODEL,
      agentModelId: DEFAULT_MODEL,

      setTrainerModel: (modelId: string) => {
        set({ trainerModelId: modelId });
      },

      setAgentModel: (modelId: string) => {
        set({ agentModelId: modelId });
      },

      getTrainerModel: () => {
        return AVAILABLE_MODELS.find((m) => m.id === get().trainerModelId);
      },

      getAgentModel: () => {
        return AVAILABLE_MODELS.find((m) => m.id === get().agentModelId);
      },
    }),
    {
      name: 'training-camp-model',
      version: 1,
      migrate: (persistedState: unknown, version: number) => {
        if (version === 0) {
          // Migration from old single-model format
          const oldState = persistedState as { selectedModelId?: string };
          return {
            trainerModelId: oldState.selectedModelId || DEFAULT_MODEL,
            agentModelId: oldState.selectedModelId || DEFAULT_MODEL,
          };
        }
        return persistedState as ModelState;
      },
    }
  )
);

// Helper to get model by ID
export function getModelById(id: string): ModelInfo | undefined {
  return AVAILABLE_MODELS.find((m) => m.id === id);
}

// Get models by tier
export function getModelsByTier(tier: ModelInfo['tier']): ModelInfo[] {
  return AVAILABLE_MODELS.filter((m) => m.tier === tier);
}
