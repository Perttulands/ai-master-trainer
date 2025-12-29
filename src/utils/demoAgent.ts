import type { AgentDefinition } from '../types/agent';
import { generateId } from './id';
import { getDirectExecutionFlow } from './flowLayout';

/**
 * Strategy tags and their associated configurations
 * NOTE: tools removed - all agents use direct LLM execution with tools: []
 * See docs/PLAN-tool-architecture-cleanup.md for rationale
 */
const STRATEGY_CONFIGS: Record<string, {
  description: string;
  systemPromptPrefix: string;
}> = {
  Concise: {
    description: 'Focused on delivering clear, brief responses without unnecessary details.',
    systemPromptPrefix: 'You are a concise AI assistant. Keep responses short and to the point.',
  },
  Detailed: {
    description: 'Provides comprehensive, well-structured responses with examples.',
    systemPromptPrefix: 'You are a detailed AI assistant. Provide thorough explanations with examples.',
  },
  Interactive: {
    description: 'Engages in dialog, asks clarifying questions, and adapts to feedback.',
    systemPromptPrefix: 'You are an interactive AI assistant. Engage in dialog and ask clarifying questions.',
  },
  Analytical: {
    description: 'Approaches tasks methodically with step-by-step reasoning.',
    systemPromptPrefix: 'You are an analytical AI assistant. Break down problems step by step.',
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
  // Use direct execution mode - no flows
  const flow = getDirectExecutionFlow();

  // Create a tailored system prompt
  const systemPrompt = `${strategyConfig.systemPromptPrefix}

Your task: ${sessionNeed}

Guidelines:
- Follow the user's instructions carefully
- Provide accurate and helpful responses
- Maintain consistent quality across interactions

When in doubt, prioritize clarity and usefulness.`;

  return {
    id: generateId(),
    name: `${labelConfig.strategy} Agent`,
    description: strategyConfig.description,
    version: 1,
    systemPrompt,
    tools: [],  // No tools - direct LLM execution only
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
