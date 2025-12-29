// Agent Generator Service
// Generates and executes real agent definitions for each lineage strategy

import type {
  AgentDefinition,
  AgentTool,
  AgentFlowStep,
  AgentMemoryConfig,
  AgentParameters,
} from '../types/agent';
import type { SessionContext } from '../types/context';
import type { LineageLabel } from '../types';
import { createAgentFromTemplate, getStrategyInfo } from '../lib/templates/agent-templates';
import { generateWithSystem, isLLMConfigured } from '../api/llm';
import { generateId } from '../utils/id';

// ============================================================================
// Types
// ============================================================================

export interface GeneratedLineageConfig {
  label: LineageLabel;
  agent: AgentDefinition;
  content: string;
}

export interface ExecutionResult {
  output: string;
  metadata: {
    toolsUsed: string[];
    tokensUsed: number;
    latencyMs: number;
  };
}

export interface EnhancementOptions {
  enhanceSystemPrompt?: boolean;
  addContextualTools?: boolean;
  adjustParameters?: boolean;
}

// ============================================================================
// System Prompts
// ============================================================================

const SYSTEM_PROMPT_ENHANCER = `You are an expert at crafting system prompts for AI agents. Your task is to enhance a base system prompt to better address a specific user need.

Given:
1. A base system prompt (which defines the agent's personality and approach)
2. The user's specific need
3. Optional constraints

Generate an enhanced system prompt that:
- Preserves the original agent's personality and approach style
- Adds specific guidance tailored to the user's need
- Incorporates any constraints naturally
- Makes the agent more effective at addressing this particular task
- Keeps the prompt concise but comprehensive

Output ONLY the enhanced system prompt - no explanations or meta-commentary.`;

// NOTE: Agent execution uses the agent's own system prompt directly.
// The execution context is built dynamically in buildExecutionPrompt().

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Generate initial agents for all 4 lineages.
 * Creates unique agent definitions based on each strategy template,
 * enhanced by LLM for the specific user need.
 *
 * IMPORTANT: LLM must be configured for this function to work.
 * Throws an error if LLM is not configured.
 *
 * @param sessionId - The session ID for tracking
 * @param need - The user's expressed need/goal
 * @param constraints - Optional constraints to apply
 * @returns Array of 4 lineage configurations with full agent definitions
 * @throws Error if LLM is not configured
 */
export async function generateInitialAgents(
  _sessionId: string,
  need: string,
  constraints?: string
): Promise<GeneratedLineageConfig[]> {
  // Require LLM to be configured - no more fallback mode
  if (!isLLMConfigured()) {
    throw new Error(
      'LLM not configured. Set VITE_LITELLM_API_BASE and VITE_LITELLM_API_KEY environment variables.'
    );
  }

  const labels: LineageLabel[] = ['A', 'B', 'C', 'D'];
  const startTime = Date.now();

  // Generate all 4 agents in parallel for speed
  const promises = labels.map(async (label) => {
    // Create base agent from template
    let agent = createAgentFromTemplate(label, need, constraints);

    // Enhance the agent's system prompt with LLM
    agent = await enhanceAgentForNeed(agent, need, constraints);

    // Generate initial content by executing the agent
    const executionResult = await executeAgent(agent, need, undefined);

    return {
      label,
      agent,
      content: executionResult.output,
    };
  });

  const results = await Promise.all(promises);
  const totalTime = Date.now() - startTime;

  console.log(`Generated ${results.length} agents in ${totalTime}ms`);

  return results;
}

/**
 * Execute an agent against input to produce output.
 * Builds a prompt from the agent's configuration and calls the LLM.
 *
 * IMPORTANT: LLM must be configured for this function to work.
 *
 * @param agent - The agent definition to execute
 * @param input - The user input to process
 * @param context - Optional session context (documents, examples, test cases)
 * @returns The output and execution metadata
 * @throws Error if LLM is not configured or execution fails
 */
export async function executeAgent(
  agent: AgentDefinition,
  input: string,
  context?: SessionContext
): Promise<ExecutionResult> {
  const startTime = Date.now();

  // Require LLM to be configured - no more fallback mode
  if (!isLLMConfigured()) {
    throw new Error(
      'LLM not configured. Set VITE_LITELLM_API_BASE and VITE_LITELLM_API_KEY environment variables.'
    );
  }

  // Build the execution prompt
  const executionPrompt = buildExecutionPrompt(agent, input, context);

  // Call the LLM with agent's parameters
  const output = await generateWithSystem(agent.systemPrompt, executionPrompt, {
    maxTokens: agent.parameters.maxTokens,
    temperature: agent.parameters.temperature,
  });

  const latencyMs = Date.now() - startTime;

  return {
    output: output.trim(),
    metadata: {
      toolsUsed: extractToolsFromFlow(agent.flow),
      tokensUsed: estimateTokens(agent.systemPrompt + executionPrompt + output),
      latencyMs,
    },
  };
}

/**
 * Evolve an agent based on evaluation feedback.
 * Adjusts the agent's system prompt and parameters based on score and directives.
 *
 * IMPORTANT: LLM must be configured for full evolution. Without LLM,
 * only parameter adjustments and directive appending are possible.
 *
 * @param agent - The current agent definition
 * @param score - The evaluation score (1-10)
 * @param stickyDirective - Persistent directive to apply
 * @param oneshotDirective - One-time directive to apply this cycle only
 * @param need - The original user need
 * @returns The evolved agent definition
 * @throws Error if LLM is not configured
 */
export async function evolveAgent(
  agent: AgentDefinition,
  score: number,
  stickyDirective: string | null,
  oneshotDirective: string | null,
  need: string
): Promise<AgentDefinition> {
  // Require LLM to be configured for proper evolution
  if (!isLLMConfigured()) {
    throw new Error(
      'LLM not configured. Set VITE_LITELLM_API_BASE and VITE_LITELLM_API_KEY environment variables.'
    );
  }

  const evolvedAgent: AgentDefinition = {
    ...agent,
    id: generateId(),
    version: agent.version + 1,
    updatedAt: Date.now(),
  };

  // Adjust parameters based on score
  evolvedAgent.parameters = adjustParametersForScore(agent.parameters, score);

  // Evolve system prompt using LLM
  evolvedAgent.systemPrompt = await evolveSystemPrompt(
    agent.systemPrompt,
    score,
    stickyDirective,
    oneshotDirective,
    need
  );

  return evolvedAgent;
}

/**
 * Clone an agent with a new ID.
 * Useful for creating variations or backups.
 *
 * @param agent - The agent to clone
 * @returns A new agent with fresh ID but same configuration
 */
export function cloneAgent(agent: AgentDefinition): AgentDefinition {
  return {
    ...agent,
    id: generateId(),
    tools: agent.tools.map((tool) => ({ ...tool, id: generateId() })),
    flow: agent.flow.map((step) => ({ ...step, id: generateId() })),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Merge two agents, combining their strengths.
 * Takes the best characteristics from each based on their scores.
 *
 * @param agentA - First agent
 * @param scoreA - Score for first agent
 * @param agentB - Second agent
 * @param scoreB - Score for second agent
 * @param need - The user need for context
 * @returns A merged agent combining both approaches
 */
export async function mergeAgents(
  agentA: AgentDefinition,
  scoreA: number,
  agentB: AgentDefinition,
  scoreB: number,
  need: string
): Promise<AgentDefinition> {
  const now = Date.now();

  // Determine which agent is "primary" based on score
  const [primary, secondary] = scoreA >= scoreB ? [agentA, agentB] : [agentB, agentA];
  const [primaryScore, secondaryScore] = scoreA >= scoreB ? [scoreA, scoreB] : [scoreB, scoreA];

  // Start with primary agent's structure
  const mergedAgent: AgentDefinition = {
    id: generateId(),
    name: `Merged Agent (${primary.name.split(' ')[0]}+${secondary.name.split(' ')[0]})`,
    description: `Combined approach merging ${primary.description} with elements of ${secondary.description}`,
    version: 1,
    systemPrompt: primary.systemPrompt,
    tools: mergeTools(primary.tools, secondary.tools),
    flow: primary.flow, // Use primary flow
    memory: mergeMemoryConfigs(primary.memory, secondary.memory),
    parameters: mergeParameters(primary.parameters, secondary.parameters, primaryScore, secondaryScore),
    createdAt: now,
    updatedAt: now,
  };

  // If LLM is available, create a merged system prompt
  if (isLLMConfigured()) {
    try {
      mergedAgent.systemPrompt = await mergeSystemPrompts(
        primary.systemPrompt,
        secondary.systemPrompt,
        need
      );
    } catch (error) {
      console.error('Failed to merge system prompts:', error);
    }
  }

  return mergedAgent;
}

// ============================================================================
// Enhancement Functions
// ============================================================================

/**
 * Enhance an agent's system prompt for a specific need.
 */
async function enhanceAgentForNeed(
  agent: AgentDefinition,
  need: string,
  constraints?: string
): Promise<AgentDefinition> {
  const enhancementPrompt = `Base system prompt:
---
${agent.systemPrompt}
---

User's need: "${need}"
${constraints ? `Constraints: ${constraints}` : ''}

Enhance this system prompt to better address the user's specific need while preserving the agent's core personality and approach.`;

  try {
    const enhancedPrompt = await generateWithSystem(SYSTEM_PROMPT_ENHANCER, enhancementPrompt, {
      maxTokens: 1024,
      temperature: 0.6,
    });

    return {
      ...agent,
      systemPrompt: enhancedPrompt.trim(),
      updatedAt: Date.now(),
    };
  } catch (error) {
    console.error('Failed to enhance agent:', error);
    return agent;
  }
}

/**
 * Evolve a system prompt based on feedback.
 */
async function evolveSystemPrompt(
  currentPrompt: string,
  score: number,
  stickyDirective: string | null,
  oneshotDirective: string | null,
  need: string
): Promise<string> {
  let evolutionGuidance = '';

  if (score >= 8) {
    evolutionGuidance = 'The approach is working well. Make minor refinements to polish the output further.';
  } else if (score >= 5) {
    evolutionGuidance = 'Moderate improvements needed. Address likely weaknesses while keeping the core approach.';
  } else {
    evolutionGuidance = 'Significant changes needed. Consider a fresh angle while maintaining the overall strategy style.';
  }

  const evolutionPrompt = `Current system prompt:
---
${currentPrompt}
---

Feedback:
- Score: ${score}/10
- Guidance: ${evolutionGuidance}
${stickyDirective ? `- Persistent directive (always apply): ${stickyDirective}` : ''}
${oneshotDirective ? `- One-time directive (apply now): ${oneshotDirective}` : ''}

Original need: "${need}"

Generate an evolved version of this system prompt that incorporates the feedback and directives.
Output ONLY the evolved system prompt.`;

  const evolvedPrompt = await generateWithSystem(SYSTEM_PROMPT_ENHANCER, evolutionPrompt, {
    maxTokens: 1024,
    temperature: score < 5 ? 0.8 : 0.5,
  });

  return evolvedPrompt.trim();
}

/**
 * Merge two system prompts into one.
 */
async function mergeSystemPrompts(
  promptA: string,
  promptB: string,
  need: string
): Promise<string> {
  const mergePrompt = `Merge these two system prompts into one cohesive prompt that combines their strengths:

Prompt A:
---
${promptA}
---

Prompt B:
---
${promptB}
---

User's need: "${need}"

Create a unified system prompt that:
- Combines the best elements of both approaches
- Maintains internal consistency
- Is optimized for the user's need
- Is concise but comprehensive

Output ONLY the merged system prompt.`;

  const mergedPrompt = await generateWithSystem(SYSTEM_PROMPT_ENHANCER, mergePrompt, {
    maxTokens: 1024,
    temperature: 0.6,
  });

  return mergedPrompt.trim();
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build the execution prompt for an agent.
 */
function buildExecutionPrompt(
  agent: AgentDefinition,
  input: string,
  context?: SessionContext
): string {
  let prompt = input;

  // Add context if available
  if (context) {
    if (context.documents.length > 0) {
      prompt += '\n\n--- Reference Documents ---\n';
      for (const doc of context.documents) {
        prompt += `\n[${doc.name}]\n${doc.content.substring(0, 2000)}\n`;
      }
    }

    if (context.examples.length > 0) {
      prompt += '\n\n--- Examples ---\n';
      for (const example of context.examples) {
        prompt += `\nInput: ${example.input}\nExpected: ${example.expectedOutput}\n`;
      }
    }
  }

  // Add tool information if agent has tools
  if (agent.tools.length > 0) {
    prompt += '\n\n--- Available Tools ---\n';
    for (const tool of agent.tools) {
      prompt += `- ${tool.name}: ${tool.description}\n`;
    }
  }

  return prompt;
}

/**
 * Adjust parameters based on evaluation score.
 */
function adjustParametersForScore(
  params: AgentParameters,
  score: number
): AgentParameters {
  const adjusted = { ...params };

  if (score < 5) {
    // Low score: increase creativity to explore different approaches
    adjusted.temperature = Math.min(1.0, params.temperature + 0.2);
    adjusted.topP = Math.min(1.0, (params.topP ?? 0.9) + 0.05);
  } else if (score >= 8) {
    // High score: reduce variance to maintain quality
    adjusted.temperature = Math.max(0.1, params.temperature - 0.1);
  }
  // Moderate scores: keep parameters stable

  return adjusted;
}

// NOTE: appendDirectivesToPrompt removed - LLM-based evolution now handles directives

/**
 * Merge tools from two agents, removing duplicates.
 */
function mergeTools(toolsA: AgentTool[], toolsB: AgentTool[]): AgentTool[] {
  const merged: AgentTool[] = [...toolsA];
  const existingNames = new Set(toolsA.map((t) => t.name));

  for (const tool of toolsB) {
    if (!existingNames.has(tool.name)) {
      merged.push({ ...tool, id: generateId() });
      existingNames.add(tool.name);
    }
  }

  return merged;
}

/**
 * Merge memory configurations, taking the more capable option.
 */
function mergeMemoryConfigs(
  memA: AgentMemoryConfig,
  memB: AgentMemoryConfig
): AgentMemoryConfig {
  const memoryRank = { none: 0, buffer: 1, summary: 2, vector: 3 };
  const rankA = memoryRank[memA.type];
  const rankB = memoryRank[memB.type];

  return rankA >= rankB ? memA : memB;
}

/**
 * Merge parameters with weighted averaging based on scores.
 */
function mergeParameters(
  paramsA: AgentParameters,
  paramsB: AgentParameters,
  scoreA: number,
  scoreB: number
): AgentParameters {
  const totalScore = scoreA + scoreB;
  const weightA = scoreA / totalScore;
  const weightB = scoreB / totalScore;

  return {
    model: paramsA.model, // Use primary model
    temperature: paramsA.temperature * weightA + paramsB.temperature * weightB,
    maxTokens: Math.round(paramsA.maxTokens * weightA + paramsB.maxTokens * weightB),
    topP:
      paramsA.topP !== undefined && paramsB.topP !== undefined
        ? paramsA.topP * weightA + paramsB.topP * weightB
        : paramsA.topP ?? paramsB.topP,
    frequencyPenalty:
      paramsA.frequencyPenalty !== undefined && paramsB.frequencyPenalty !== undefined
        ? paramsA.frequencyPenalty * weightA + paramsB.frequencyPenalty * weightB
        : paramsA.frequencyPenalty ?? paramsB.frequencyPenalty,
    presencePenalty:
      paramsA.presencePenalty !== undefined && paramsB.presencePenalty !== undefined
        ? paramsA.presencePenalty * weightA + paramsB.presencePenalty * weightB
        : paramsA.presencePenalty ?? paramsB.presencePenalty,
  };
}

/**
 * Extract tool names from agent flow.
 */
function extractToolsFromFlow(flow: AgentFlowStep[]): string[] {
  return flow
    .filter((step) => step.type === 'tool')
    .map((step) => (step.config.toolName as string) || step.name);
}

/**
 * Estimate token count for a string.
 */
function estimateTokens(text: string): number {
  // Rough approximation: ~4 characters per token on average
  return Math.ceil(text.length / 4);
}

// NOTE: Fallback functions removed. LLM is now required for all operations.
// See generateInitialAgents(), executeAgent(), and evolveAgent() which all
// throw errors when LLM is not configured.

// ============================================================================
// Utility Exports
// ============================================================================

/**
 * Check if the generator service is fully operational.
 */
export function isGeneratorReady(): boolean {
  return isLLMConfigured();
}

/**
 * Get generator service status.
 */
export function getGeneratorStatus(): {
  llmConfigured: boolean;
  availableStrategies: LineageLabel[];
} {
  return {
    llmConfigured: isLLMConfigured(),
    availableStrategies: ['A', 'B', 'C', 'D'],
  };
}

/**
 * Re-export useful functions from templates.
 */
export { getStrategyInfo, createAgentFromTemplate };
