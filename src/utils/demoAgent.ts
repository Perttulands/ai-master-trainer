import type { AgentDefinition, AgentFlowStep, AgentTool } from '../types/agent';
import { generateId } from './id';
import { getDefaultDemoFlow } from './flowLayout';

/**
 * Strategy tags and their associated configurations
 */
const STRATEGY_CONFIGS: Record<string, {
  description: string;
  systemPromptPrefix: string;
  tools: AgentTool[];
  flowModifier?: (baseFlow: AgentFlowStep[]) => AgentFlowStep[];
}> = {
  Concise: {
    description: 'Focused on delivering clear, brief responses without unnecessary details.',
    systemPromptPrefix: 'You are a concise AI assistant. Keep responses short and to the point.',
    tools: [],
    flowModifier: (flow) => flow.filter(s => s.type !== 'loop'), // Simpler flow
  },
  Detailed: {
    description: 'Provides comprehensive, well-structured responses with examples.',
    systemPromptPrefix: 'You are a detailed AI assistant. Provide thorough explanations with examples.',
    tools: [
      {
        id: generateId(),
        name: 'format_markdown',
        description: 'Format response as structured markdown',
        type: 'builtin',
        config: { builtinName: 'format_markdown' },
        parameters: [
          { name: 'content', type: 'string', description: 'Content to format', required: true },
          { name: 'style', type: 'string', description: 'Formatting style', required: false },
        ],
      },
    ],
  },
  Interactive: {
    description: 'Engages in dialog, asks clarifying questions, and adapts to feedback.',
    systemPromptPrefix: 'You are an interactive AI assistant. Engage in dialog and ask clarifying questions.',
    tools: [
      {
        id: generateId(),
        name: 'ask_clarification',
        description: 'Ask user for clarification',
        type: 'function',
        config: { code: 'return { question: args.question }' },
        parameters: [
          { name: 'question', type: 'string', description: 'Clarifying question', required: true },
        ],
      },
    ],
  },
  Analytical: {
    description: 'Approaches tasks methodically with step-by-step reasoning.',
    systemPromptPrefix: 'You are an analytical AI assistant. Break down problems step by step.',
    tools: [
      {
        id: generateId(),
        name: 'web_search',
        description: 'Search the web for information',
        type: 'api',
        config: { endpoint: 'https://api.search.com/v1/search', method: 'GET' },
        parameters: [
          { name: 'query', type: 'string', description: 'Search query', required: true },
          { name: 'max_results', type: 'number', description: 'Max results to return', required: false },
        ],
      },
      {
        id: generateId(),
        name: 'analyze_data',
        description: 'Analyze structured data',
        type: 'function',
        config: { code: 'return analyzeData(args.data)' },
        parameters: [
          { name: 'data', type: 'object', description: 'Data to analyze', required: true },
        ],
      },
    ],
  },
};

/**
 * Labels and their visual configurations
 */
const LABEL_CONFIGS: Record<string, { strategy: string }> = {
  A: { strategy: 'Concise' },
  B: { strategy: 'Detailed' },
  C: { strategy: 'Interactive' },
  D: { strategy: 'Analytical' },
};

/**
 * Generate a demo agent for a lineage
 */
export function generateDemoAgent(
  _lineageId: string,
  lineageLabel: string,
  sessionNeed: string
): AgentDefinition {
  const labelConfig = LABEL_CONFIGS[lineageLabel] || LABEL_CONFIGS['A'];
  const strategyConfig = STRATEGY_CONFIGS[labelConfig.strategy] || STRATEGY_CONFIGS['Concise'];

  const now = Date.now();
  const baseFlow = getDefaultDemoFlow();
  const flow = strategyConfig.flowModifier
    ? strategyConfig.flowModifier(baseFlow)
    : baseFlow;

  // Create a tailored system prompt
  const systemPrompt = `${strategyConfig.systemPromptPrefix}

Your task: ${sessionNeed}

Guidelines:
- Follow the user's instructions carefully
- Provide accurate and helpful responses
- Use available tools when appropriate
- Maintain consistent quality across interactions

When in doubt, prioritize clarity and usefulness.`;

  return {
    id: generateId(),
    name: `${labelConfig.strategy} Agent`,
    description: strategyConfig.description,
    version: 1,
    systemPrompt,
    tools: strategyConfig.tools,
    flow,
    memory: {
      type: 'buffer',
      config: {
        maxMessages: 10,
        maxTokens: 4000,
      },
    },
    parameters: {
      model: 'claude-4-5-sonnet',
      temperature: lineageLabel === 'A' ? 0.3 : lineageLabel === 'D' ? 0.5 : 0.7,
      maxTokens: 2048,
      topP: 0.95,
    },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Generate demo agents for all lineages in a session
 */
export function generateDemoAgentsForSession(
  lineages: Array<{ id: string; label: string }>,
  sessionNeed: string
): Map<string, AgentDefinition> {
  const agents = new Map<string, AgentDefinition>();

  for (const lineage of lineages) {
    const agent = generateDemoAgent(lineage.id, lineage.label, sessionNeed);
    agents.set(lineage.id, agent);
  }

  return agents;
}
