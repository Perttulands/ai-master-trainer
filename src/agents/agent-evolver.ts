/**
 * @deprecated This module is deprecated. Use `src/services/agent-evolver.ts` instead.
 *
 * This simple evolver only modifies the system prompt. The full evolver in
 * `src/services/agent-evolver.ts` modifies all agent components:
 * - System prompt (with LLM-based or deterministic evolution)
 * - Tools (descriptions, parameters, error handling)
 * - Parameters (temperature, penalties, max tokens)
 * - Flow (validation steps for major changes)
 *
 * Migration:
 * ```typescript
 * // Old (deprecated):
 * import { evolveAgent } from '../agents/agent-evolver';
 * const evolved = await evolveAgent({ lineage, currentAgent, need, previousScore, cycle });
 *
 * // New (recommended):
 * import { evolveAgent } from '../services/agent-evolver';
 * const evolved = await evolveAgent(agent, need, score, feedback, stickyDirective, oneshotDirective);
 * ```
 */

// Agent Evolver - Evolves AgentDefinition objects based on feedback

import { generateWithSystem, isLLMConfigured } from '../api/llm';
import type { AgentDefinition, AgentFlowStep, AgentTool } from '../types/agent';
import type { Lineage, LineageLabel } from '../types';
import { generateId } from '../utils/id';
import { getStrategyConfig } from './agent-generator';

const EVOLUTION_SYSTEM_PROMPT = `You are an expert AI agent architect specializing in agent evolution. Your task is to improve an agent's system prompt based on user feedback (score and directives).

Evolution Strategy Based on Score:
- Score 8-10: Refine and polish. The approach is working well. Make subtle improvements while preserving the core.
- Score 5-7: Moderate improvements. Address likely pain points while maintaining the general direction.
- Score 1-4: Significant changes needed. Take a different approach while staying within the strategy style.

Apply any directives (sticky or one-shot) as specific guidance for the evolution.

Output ONLY the new system prompt - no explanations, no JSON, no meta-commentary.`;

interface EvolveAgentOptions {
  lineage: Lineage;
  currentAgent: AgentDefinition;
  need: string;
  previousScore: number;
  cycle: number;
}

/**
 * Evolve an agent based on user feedback
 * @deprecated Use `evolveAgent` from `src/services/agent-evolver.ts` instead.
 */
export async function evolveAgent(options: EvolveAgentOptions): Promise<AgentDefinition> {
  const { lineage, currentAgent, cycle } = options;

  if (!isLLMConfigured()) {
    console.warn('LLM not configured, using fallback agent evolution');
    return generateFallbackEvolution(options);
  }

  try {
    const evolvedPrompt = await generateEvolvedSystemPrompt(options);
    return createEvolvedAgent(currentAgent, evolvedPrompt, cycle, lineage.label);
  } catch (error) {
    console.error(`Failed to evolve agent for lineage ${lineage.label}:`, error);
    return generateFallbackEvolution(options);
  }
}

/**
 * Generate an evolved system prompt using LLM
 */
async function generateEvolvedSystemPrompt(options: EvolveAgentOptions): Promise<string> {
  const { lineage, currentAgent, need, previousScore, cycle } = options;
  const strategyConfig = getStrategyConfig(lineage.label);

  let userPrompt = `Evolve this agent's system prompt for cycle ${cycle}.

Agent Context:
- Name: ${currentAgent.name}
- Strategy: ${strategyConfig.tag} - ${strategyConfig.description}
- Original Need: "${need}"
- Previous Score: ${previousScore}/10

Current System Prompt:
---
${currentAgent.systemPrompt}
---`;

  // Add evolution guidance based on score
  if (previousScore >= 8) {
    userPrompt += '\n\nHigh score indicates success. Polish and refine while keeping the core approach.';
  } else if (previousScore >= 5) {
    userPrompt += '\n\nModerate score. Improve on weaknesses while maintaining direction.';
  } else {
    userPrompt += '\n\nLow score indicates significant changes needed. Try a fresh angle within the strategy style.';
  }

  // Add directives
  if (lineage.directiveSticky) {
    userPrompt += `\n\nPersistent directive (always apply): ${lineage.directiveSticky}`;
  }
  if (lineage.directiveOneshot) {
    userPrompt += `\n\nOne-time directive (apply this cycle only): ${lineage.directiveOneshot}`;
  }

  userPrompt += '\n\nGenerate the evolved system prompt now:';

  const evolvedPrompt = await generateWithSystem(EVOLUTION_SYSTEM_PROMPT, userPrompt, {
    maxTokens: 512,
    temperature: previousScore < 5 ? 0.9 : 0.7, // More creative for low scores
  });

  return evolvedPrompt.trim();
}

/**
 * Create an evolved agent with a new system prompt
 */
function createEvolvedAgent(
  currentAgent: AgentDefinition,
  newSystemPrompt: string,
  _cycle: number,
  label: LineageLabel
): AgentDefinition {
  const now = Date.now();
  const strategyConfig = getStrategyConfig(label);

  return {
    ...currentAgent,
    id: generateId(), // New ID for new version
    version: currentAgent.version + 1,
    systemPrompt: newSystemPrompt,
    // Keep tools but could evolve them too in the future
    tools: currentAgent.tools,
    // Keep flow but could evolve it too in the future
    flow: currentAgent.flow,
    // Adjust parameters slightly based on evolution
    parameters: {
      ...currentAgent.parameters,
      // Slightly adjust temperature based on strategy
      temperature: strategyConfig.temperature,
    },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Fallback evolution when LLM is not available
 */
function generateFallbackEvolution(options: EvolveAgentOptions): AgentDefinition {
  const { lineage, currentAgent, need, previousScore, cycle } = options;
  const strategyConfig = getStrategyConfig(lineage.label);
  const now = Date.now();

  let evolutionNote = '';
  if (previousScore >= 8) {
    evolutionNote = 'Refined based on high score - polishing successful approach.';
  } else if (previousScore >= 5) {
    evolutionNote = 'Improved based on moderate score - addressing potential weaknesses.';
  } else {
    evolutionNote = 'Significantly revised based on low score - trying fresh approach.';
  }

  const directiveNote = lineage.directiveSticky
    ? `\n- Persistent guidance: ${lineage.directiveSticky}`
    : '';
  const oneshotNote = lineage.directiveOneshot
    ? `\n- One-time guidance: ${lineage.directiveOneshot}`
    : '';

  const evolvedPrompt = `You are a ${strategyConfig.tag.toLowerCase()} AI assistant designed for: ${need}

[Cycle ${cycle} Evolution]
${evolutionNote}${directiveNote}${oneshotNote}

Your approach is ${strategyConfig.style}.

Guidelines:
- Follow the user's instructions carefully
- Maintain your ${strategyConfig.tag.toLowerCase()} style consistently
- Provide accurate and helpful responses
- Use available tools when appropriate
- Previous feedback score: ${previousScore}/10

When in doubt, prioritize ${lineage.label === 'A' ? 'brevity' : lineage.label === 'B' ? 'completeness' : lineage.label === 'C' ? 'creativity' : 'accuracy'}.`;

  return {
    ...currentAgent,
    id: generateId(),
    version: currentAgent.version + 1,
    systemPrompt: evolvedPrompt,
    parameters: {
      ...currentAgent.parameters,
      temperature: strategyConfig.temperature,
    },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Evolve tools based on feedback (future enhancement)
 */
export function evolveTools(
  currentTools: AgentTool[],
  _feedback: { score: number; comment?: string }
): AgentTool[] {
  // For now, keep tools unchanged
  // Future: Add/remove/modify tools based on feedback
  return currentTools;
}

/**
 * Evolve flow based on feedback (future enhancement)
 */
export function evolveFlow(
  currentFlow: AgentFlowStep[],
  _feedback: { score: number; comment?: string }
): AgentFlowStep[] {
  // For now, keep flow unchanged
  // Future: Modify flow based on feedback patterns
  return currentFlow;
}
