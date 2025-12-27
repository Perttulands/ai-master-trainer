export interface AgentTool {
  id: string;
  name: string;
  description: string;
  type: 'builtin' | 'api' | 'function';
  config: {
    endpoint?: string;
    method?: string;
    headers?: Record<string, string>;
    code?: string;
    builtinName?: string;
  };
  parameters: {
    name: string;
    type: string;
    description: string;
    required: boolean;
  }[];
}

export interface AgentFlowStep {
  id: string;
  type: 'start' | 'prompt' | 'tool' | 'condition' | 'loop' | 'output';
  name: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
  connections: {
    next?: string;
    onTrue?: string;
    onFalse?: string;
    onError?: string;
  };
}

export interface AgentMemoryConfig {
  type: 'none' | 'buffer' | 'summary' | 'vector';
  config: {
    maxTokens?: number;
    maxMessages?: number;
    embeddingModel?: string;
  };
}

export interface AgentParameters {
  model: string;
  temperature: number;
  maxTokens: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export interface AgentConstraints {
  maxTokens?: number;
  allowedTools?: string[];
  forbiddenPatterns?: string[];
}

export interface AgentDefinition {
  id: string;
  lineageId?: string;  // Optional: links agent to a lineage for evolution tracking
  name: string;
  description: string;
  version: number;
  systemPrompt: string;
  tools: AgentTool[];
  flow: AgentFlowStep[];
  memory: AgentMemoryConfig;
  parameters: AgentParameters;
  constraints?: AgentConstraints;
  // Hashes for reproducibility
  systemPromptHash?: string;
  toolsHash?: string;
  flowHash?: string;
  createdAt: number;
  updatedAt: number;
}
