// Agent Generator - Creates AgentDefinition objects for lineages

import { generateWithSystem, isLLMConfigured } from '../api/llm';
import type { AgentDefinition, AgentFlowStep, AgentTool } from '../types/agent';
import type { LineageLabel } from '../types';
import type { CustomStrategy } from '../types/strategy';
import { generateId } from '../utils/id';
import { getDefaultDemoFlow } from '../utils/flowLayout';

// Strategy configurations for each lineage label
const STRATEGY_CONFIGS: Record<
  LineageLabel,
  {
    tag: string;
    description: string;
    style: string;
    temperature: number;
    tools: AgentTool[];
    flowModifier?: (baseFlow: AgentFlowStep[]) => AgentFlowStep[];
  }
> = {
  A: {
    tag: 'Concise',
    description: 'Focused on delivering clear, brief responses without unnecessary details.',
    style: 'brief and to-the-point, minimizing words while maximizing clarity',
    temperature: 0.3,
    tools: [],
    flowModifier: (flow) => flow.filter((s) => s.type !== 'loop'), // Simpler flow
  },
  B: {
    tag: 'Detailed',
    description: 'Provides comprehensive, well-structured responses with examples.',
    style: 'thorough and comprehensive, covering all aspects with examples',
    temperature: 0.5,
    tools: [
      {
        id: generateId(),
        name: 'format_markdown',
        description: 'Format response as structured markdown with headers and sections',
        type: 'builtin',
        config: { builtinName: 'format_markdown' },
        parameters: [
          { name: 'content', type: 'string', description: 'Content to format', required: true },
          { name: 'style', type: 'string', description: 'Formatting style (outline, prose, mixed)', required: false },
        ],
      },
    ],
  },
  C: {
    tag: 'Creative',
    description: 'Engages with innovative angles, unique perspectives, and fresh approaches.',
    style: 'creative and engaging, using metaphors, stories, and unexpected angles',
    temperature: 0.9,
    tools: [
      {
        id: generateId(),
        name: 'brainstorm',
        description: 'Generate creative alternatives and unique angles',
        type: 'function',
        config: { code: 'return generateAlternatives(args.topic, args.count)' },
        parameters: [
          { name: 'topic', type: 'string', description: 'Topic to brainstorm', required: true },
          { name: 'count', type: 'number', description: 'Number of alternatives', required: false },
        ],
      },
    ],
  },
  D: {
    tag: 'Analytical',
    description: 'Approaches tasks methodically with step-by-step reasoning and data focus.',
    style: 'structured and analytical, breaking down problems with clear logic',
    temperature: 0.4,
    tools: [
      {
        id: generateId(),
        name: 'analyze_data',
        description: 'Analyze structured data and extract insights',
        type: 'function',
        config: { code: 'return analyzeData(args.data)' },
        parameters: [
          { name: 'data', type: 'object', description: 'Data to analyze', required: true },
          { name: 'metrics', type: 'array', description: 'Metrics to compute', required: false },
        ],
      },
      {
        id: generateId(),
        name: 'web_search',
        description: 'Search the web for factual information',
        type: 'api',
        config: { endpoint: 'https://api.search.com/v1/search', method: 'GET' },
        parameters: [
          { name: 'query', type: 'string', description: 'Search query', required: true },
          { name: 'max_results', type: 'number', description: 'Max results to return', required: false },
        ],
      },
    ],
  },
};

const AGENT_GENERATION_SYSTEM_PROMPT = `You are an expert AI agent architect. Your task is to create a system prompt for an AI agent based on the user's need and the specified strategy.

The system prompt should:
1. Clearly define the agent's role and purpose
2. Include specific instructions that embody the strategy style
3. Provide guidelines for handling different types of requests
4. Be practical and immediately usable

Output ONLY the system prompt text - no explanations, no JSON, no meta-commentary.`;

export interface GeneratedAgentConfig {
  label: LineageLabel;
  strategyTag: string;
  agent: AgentDefinition;
}

/**
 * Generate initial agents for all 4 lineages (uses default strategies)
 */
export async function generateInitialAgents(
  need: string,
  constraints?: string
): Promise<GeneratedAgentConfig[]> {
  const labels: LineageLabel[] = ['A', 'B', 'C', 'D'];

  if (!isLLMConfigured()) {
    console.warn('LLM not configured, using fallback agent generation');
    return labels.map((label) => generateFallbackAgent(label, need, constraints));
  }

  // Generate all 4 agents in parallel
  const promises = labels.map(async (label) => {
    try {
      return await generateAgentForLabel(label, need, constraints);
    } catch (error) {
      console.error(`Failed to generate agent for lineage ${label}:`, error);
      return generateFallbackAgent(label, need, constraints);
    }
  });

  return Promise.all(promises);
}

/**
 * Generate agents from custom strategies (from strategy discussion)
 */
export async function generateAgentsFromStrategies(
  need: string,
  strategies: CustomStrategy[],
  constraints?: string
): Promise<GeneratedAgentConfig[]> {
  if (!isLLMConfigured()) {
    console.warn('LLM not configured, using custom strategies with fallback generation');
    // Still need to await since generateAgentFromCustomStrategy is async
    return Promise.all(
      strategies.map((strategy) => generateAgentFromCustomStrategy(strategy, need, constraints, false))
    );
  }

  // Generate all 4 agents in parallel using custom strategies
  const promises = strategies.map(async (strategy) => {
    try {
      return await generateAgentFromCustomStrategy(strategy, need, constraints, true);
    } catch (error) {
      console.error(`Failed to generate agent for lineage ${strategy.label}:`, error);
      return generateAgentFromCustomStrategy(strategy, need, constraints, false);
    }
  });

  return Promise.all(promises);
}

/**
 * Generate an agent from a custom strategy
 */
async function generateAgentFromCustomStrategy(
  strategy: CustomStrategy,
  need: string,
  constraints?: string,
  useLLM: boolean = true
): Promise<GeneratedAgentConfig> {
  const now = Date.now();

  // Get base config for tools and flow modifiers
  const baseConfig = STRATEGY_CONFIGS[strategy.label];

  let systemPrompt: string;

  if (useLLM && isLLMConfigured()) {
    // Build prompt for LLM to generate system prompt
    let userPrompt = `Create a system prompt for an AI agent with this configuration:

User Need: "${need}"
Strategy: ${strategy.name} - ${strategy.description}
Style: ${strategy.style}`;

    if (constraints) {
      userPrompt += `\n\nConstraints to incorporate:\n${constraints}`;
    }

    userPrompt += `\n\nGenerate the system prompt now:`;

    systemPrompt = await generateWithSystem(AGENT_GENERATION_SYSTEM_PROMPT, userPrompt, {
      maxTokens: 512,
      temperature: 0.7,
    });
    systemPrompt = systemPrompt.trim();
  } else {
    // Fallback: create system prompt from strategy info
    const constraintNote = constraints ? `\n\nConstraints to follow:\n${constraints}` : '';
    systemPrompt = `You are a ${strategy.name.toLowerCase()} AI assistant designed for: ${need}

Your approach is ${strategy.style}.

${strategy.description}

Guidelines:
- Follow the user's instructions carefully
- Maintain your ${strategy.name.toLowerCase()} style consistently
- Provide accurate and helpful responses
- Use available tools when appropriate${constraintNote}`;
  }

  // Build the flow
  const baseFlow = getDefaultDemoFlow();
  const flow = baseConfig.flowModifier ? baseConfig.flowModifier(baseFlow) : baseFlow;

  const agent: AgentDefinition = {
    id: generateId(),
    name: `${strategy.name} Agent`,
    description: strategy.description,
    version: 1,
    systemPrompt,
    tools: baseConfig.tools,
    flow,
    memory: {
      type: 'buffer',
      config: {
        maxMessages: 10,
        maxTokens: 4000,
      },
    },
    parameters: {
      model: 'claude-sonnet-4-20250514',
      temperature: strategy.temperature,
      maxTokens: 2048,
      topP: 0.95,
    },
    createdAt: now,
    updatedAt: now,
  };

  return {
    label: strategy.label,
    strategyTag: strategy.name,
    agent,
  };
}

/**
 * Generate an agent for a specific lineage label
 */
async function generateAgentForLabel(
  label: LineageLabel,
  need: string,
  constraints?: string
): Promise<GeneratedAgentConfig> {
  const config = STRATEGY_CONFIGS[label];
  const now = Date.now();

  // Build prompt for LLM to generate system prompt
  let userPrompt = `Create a system prompt for an AI agent with this configuration:

User Need: "${need}"
Strategy: ${config.tag} - ${config.description}
Style: ${config.style}`;

  if (constraints) {
    userPrompt += `\n\nConstraints to incorporate:\n${constraints}`;
  }

  userPrompt += `\n\nGenerate the system prompt now:`;

  // Get LLM-generated system prompt
  const systemPrompt = await generateWithSystem(AGENT_GENERATION_SYSTEM_PROMPT, userPrompt, {
    maxTokens: 512,
    temperature: 0.7,
  });

  // Build the flow
  const baseFlow = getDefaultDemoFlow();
  const flow = config.flowModifier ? config.flowModifier(baseFlow) : baseFlow;

  const agent: AgentDefinition = {
    id: generateId(),
    name: `${config.tag} Agent`,
    description: config.description,
    version: 1,
    systemPrompt: systemPrompt.trim(),
    tools: config.tools,
    flow,
    memory: {
      type: 'buffer',
      config: {
        maxMessages: 10,
        maxTokens: 4000,
      },
    },
    parameters: {
      model: 'claude-sonnet-4-20250514',
      temperature: config.temperature,
      maxTokens: 2048,
      topP: 0.95,
    },
    createdAt: now,
    updatedAt: now,
  };

  return {
    label,
    strategyTag: config.tag,
    agent,
  };
}

/**
 * Fallback agent generation when LLM is not available
 * Also exported for use when evolving agents without a base agent
 */
export function generateFallbackAgent(
  label: LineageLabel,
  need: string,
  constraints?: string
): GeneratedAgentConfig {
  const config = STRATEGY_CONFIGS[label];
  const now = Date.now();

  const constraintNote = constraints ? `\n\nConstraints to follow:\n${constraints}` : '';

  const systemPrompt = `You are a ${config.tag.toLowerCase()} AI assistant designed for: ${need}

Your approach is ${config.style}.

Guidelines:
- Follow the user's instructions carefully
- Maintain your ${config.tag.toLowerCase()} style consistently
- Provide accurate and helpful responses
- Use available tools when appropriate${constraintNote}

When in doubt, prioritize ${label === 'A' ? 'brevity' : label === 'B' ? 'completeness' : label === 'C' ? 'creativity' : 'accuracy'}.`;

  const baseFlow = getDefaultDemoFlow();
  const flow = config.flowModifier ? config.flowModifier(baseFlow) : baseFlow;

  const agent: AgentDefinition = {
    id: generateId(),
    name: `${config.tag} Agent`,
    description: config.description,
    version: 1,
    systemPrompt,
    tools: config.tools,
    flow,
    memory: {
      type: 'buffer',
      config: {
        maxMessages: 10,
        maxTokens: 4000,
      },
    },
    parameters: {
      model: 'claude-sonnet-4-20250514',
      temperature: config.temperature,
      maxTokens: 2048,
      topP: 0.95,
    },
    createdAt: now,
    updatedAt: now,
  };

  return {
    label,
    strategyTag: config.tag,
    agent,
  };
}

/**
 * Get strategy configuration for a lineage label
 */
export function getStrategyConfig(label: LineageLabel) {
  return STRATEGY_CONFIGS[label];
}

/**
 * Get all strategy configurations
 */
export function getAllStrategyConfigs() {
  return STRATEGY_CONFIGS;
}
