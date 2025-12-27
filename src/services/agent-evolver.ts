// Agent Evolution Service
// Evolves agent definitions based on user feedback and scores

import type {
  AgentDefinition,
  AgentTool,
  AgentParameters,
  AgentFlowStep,
} from '../types/agent';
import { llmClient, isLLMConfigured } from '../api/llm';
import { generateId } from '../utils/id';

// Evolution intensity levels based on score
type EvolutionIntensity = 'minor' | 'moderate' | 'major';

function getEvolutionIntensity(score: number): EvolutionIntensity {
  if (score >= 8) return 'minor';
  if (score >= 5) return 'moderate';
  return 'major';
}

/**
 * Evolves the system prompt based on score and directives
 * Uses LLM when available, falls back to deterministic changes
 */
export async function evolveSystemPrompt(
  currentPrompt: string,
  score: number,
  directives: string | null
): Promise<string> {
  const intensity = getEvolutionIntensity(score);

  // Try LLM-based evolution
  if (isLLMConfigured()) {
    try {
      const systemMessage = `You are an AI agent prompt engineer. Your task is to improve system prompts based on performance feedback.
Evolution intensity: ${intensity}
${directives ? `User directives to incorporate: ${directives}` : ''}

For ${intensity} changes:
${intensity === 'minor' ? '- Make subtle refinements to clarity and precision\n- Polish wording without changing core behavior\n- Ensure consistency in tone' : ''}
${intensity === 'moderate' ? '- Adjust emphasis on key behaviors\n- Add or refine specific instructions\n- Improve structure and organization' : ''}
${intensity === 'major' ? '- Significantly rewrite for better clarity\n- Restructure the prompt organization\n- Add new behavioral guidelines\n- Remove ineffective instructions' : ''}

Return ONLY the improved system prompt, no explanations.`;

      const userMessage = `Current system prompt (score: ${score}/10):
---
${currentPrompt}
---

Improve this prompt according to the evolution intensity level.`;

      const improvedPrompt = await llmClient.chat(
        [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userMessage },
        ],
        { maxTokens: 2048, temperature: intensity === 'major' ? 0.8 : 0.5 }
      );

      return improvedPrompt.trim();
    } catch (error) {
      console.warn('LLM evolution failed, using fallback:', error);
    }
  }

  // Fallback: Deterministic evolution
  let evolvedPrompt = currentPrompt;

  // Apply directives if present
  if (directives) {
    evolvedPrompt = `${evolvedPrompt}\n\nAdditional guidance: ${directives}`;
  }

  // Add intensity-based modifications
  switch (intensity) {
    case 'minor':
      // Minor polish - add clarity reminder
      if (!evolvedPrompt.includes('Be clear and precise')) {
        evolvedPrompt = `${evolvedPrompt}\n\nBe clear and precise in your responses.`;
      }
      break;

    case 'moderate':
      // Moderate changes - add structure
      if (!evolvedPrompt.includes('Follow these guidelines')) {
        evolvedPrompt = `${evolvedPrompt}\n\nFollow these guidelines:\n1. Focus on accuracy\n2. Provide relevant details\n3. Be concise but thorough`;
      }
      break;

    case 'major':
      // Major overhaul - restructure
      evolvedPrompt = `CORE OBJECTIVE:\n${currentPrompt}\n\nKEY BEHAVIORS:\n- Prioritize accuracy over speed\n- Validate assumptions before acting\n- Provide clear explanations for decisions\n- Ask for clarification when needed\n\nQUALITY STANDARDS:\n- Ensure completeness of responses\n- Maintain consistency in approach\n- Focus on user satisfaction${directives ? `\n\nSPECIFIC GUIDANCE:\n${directives}` : ''}`;
      break;
  }

  return evolvedPrompt;
}

/**
 * Evolves agent tools based on performance score
 * Adjusts tool configurations and may add/remove tools
 */
export function evolveTools(tools: AgentTool[], score: number): AgentTool[] {
  const intensity = getEvolutionIntensity(score);
  const evolvedTools = tools.map((tool) => ({ ...tool }));

  switch (intensity) {
    case 'minor':
      // Minor: Just refine descriptions
      return evolvedTools.map((tool) => ({
        ...tool,
        description: tool.description.endsWith('.')
          ? tool.description
          : `${tool.description}.`,
      }));

    case 'moderate':
      // Moderate: Improve parameter descriptions
      return evolvedTools.map((tool) => ({
        ...tool,
        parameters: tool.parameters.map((param) => ({
          ...param,
          description: param.required
            ? `(Required) ${param.description}`
            : param.description,
        })),
      }));

    case 'major':
      // Major: Consider restructuring tools
      // Add error handling hints to descriptions
      return evolvedTools.map((tool) => ({
        ...tool,
        id: generateId(), // New ID for major evolution
        description: `${tool.description} Handle errors gracefully.`,
        parameters: tool.parameters.map((param) => ({
          ...param,
          description: `${param.description}${param.required ? ' (Required - must be provided)' : ' (Optional)'}`,
        })),
      }));
  }
}

/**
 * Evolves agent parameters (model settings) based on score
 * Adjusts temperature, penalties, and other model parameters
 */
export function evolveParameters(
  params: AgentParameters,
  score: number
): AgentParameters {
  const intensity = getEvolutionIntensity(score);
  const evolved = { ...params };

  switch (intensity) {
    case 'minor':
      // Minor: Slight temperature adjustment
      if (score >= 9) {
        // Near perfect - keep stable
        evolved.temperature = Math.max(0.1, params.temperature - 0.05);
      } else {
        // Good but room for improvement
        evolved.temperature = Math.min(1.0, params.temperature + 0.05);
      }
      break;

    case 'moderate':
      // Moderate: Adjust temperature and add/modify penalties
      evolved.temperature = score >= 6 ? 0.6 : 0.8;
      evolved.frequencyPenalty = (params.frequencyPenalty ?? 0) + 0.1;
      evolved.presencePenalty = (params.presencePenalty ?? 0) + 0.1;
      break;

    case 'major':
      // Major: Significant parameter changes
      evolved.temperature = 0.7; // Reset to balanced
      evolved.maxTokens = Math.min(4096, params.maxTokens + 512);
      evolved.topP = 0.9;
      evolved.frequencyPenalty = 0.3;
      evolved.presencePenalty = 0.3;
      break;
  }

  // Clamp values to valid ranges
  evolved.temperature = Math.max(0, Math.min(2, evolved.temperature));
  evolved.frequencyPenalty = evolved.frequencyPenalty
    ? Math.max(-2, Math.min(2, evolved.frequencyPenalty))
    : undefined;
  evolved.presencePenalty = evolved.presencePenalty
    ? Math.max(-2, Math.min(2, evolved.presencePenalty))
    : undefined;

  return evolved;
}

/**
 * Evolves flow steps for major changes
 * Restructures the agent's execution flow
 */
function evolveFlow(
  flow: AgentFlowStep[],
  intensity: EvolutionIntensity
): AgentFlowStep[] {
  if (intensity !== 'major') {
    // Only major changes affect flow
    return flow;
  }

  // For major overhaul, we might add validation steps
  const evolvedFlow = flow.map((step) => ({
    ...step,
    id: generateId(), // New IDs for major evolution
  }));

  // Check if there's already a validation step
  const hasValidation = evolvedFlow.some(
    (step) =>
      step.type === 'condition' &&
      step.name.toLowerCase().includes('valid')
  );

  // Add a validation step if missing (for major overhauls)
  if (!hasValidation && evolvedFlow.length > 0) {
    const lastStep = evolvedFlow[evolvedFlow.length - 1];
    if (lastStep.type === 'output') {
      // Insert validation before output
      const validationStep: AgentFlowStep = {
        id: generateId(),
        type: 'condition',
        name: 'Validate Output',
        config: {
          condition: 'output.isValid',
          description: 'Validate output before returning',
        },
        position: {
          x: lastStep.position.x,
          y: lastStep.position.y - 100,
        },
        connections: {
          onTrue: lastStep.id,
          onFalse: evolvedFlow[0]?.id, // Retry from start
        },
      };

      // Find the step that connects to the output and update it
      const previousStepIndex = evolvedFlow.findIndex(
        (s) => s.connections.next === lastStep.id
      );
      if (previousStepIndex >= 0) {
        evolvedFlow[previousStepIndex].connections.next = validationStep.id;
      }

      evolvedFlow.splice(evolvedFlow.length - 1, 0, validationStep);
    }
  }

  return evolvedFlow;
}

/**
 * Main evolution function
 * Evolves an agent definition based on feedback and score
 */
export async function evolveAgent(
  agent: AgentDefinition,
  need: string,
  score: number,
  feedback: string | null,
  stickyDirective: string | null,
  oneshotDirective: string | null
): Promise<AgentDefinition> {
  // Validate score
  if (score < 1 || score > 10) {
    throw new Error('Score must be between 1 and 10');
  }

  const intensity = getEvolutionIntensity(score);

  // Combine directives for prompt evolution
  const combinedDirectives = [stickyDirective, oneshotDirective, feedback]
    .filter(Boolean)
    .join('\n');

  // Evolve each component
  const [evolvedSystemPrompt] = await Promise.all([
    evolveSystemPrompt(
      agent.systemPrompt,
      score,
      combinedDirectives || null
    ),
  ]);

  const evolvedTools = evolveTools(agent.tools, score);
  const evolvedParameters = evolveParameters(agent.parameters, score);
  const evolvedFlow = evolveFlow(agent.flow, intensity);

  // Clone agent with evolved components
  const evolvedAgent: AgentDefinition = {
    ...agent,
    id: generateId(),
    version: agent.version + 1,
    systemPrompt: evolvedSystemPrompt,
    tools: evolvedTools,
    flow: evolvedFlow,
    parameters: evolvedParameters,
    updatedAt: Date.now(),
  };

  // If LLM is available and we're doing major changes, try to improve name/description
  if (isLLMConfigured() && intensity === 'major') {
    try {
      const metaPrompt = `Given an AI agent that was performing poorly (score: ${score}/10) for the need: "${need}"
Current name: ${agent.name}
Current description: ${agent.description}
${feedback ? `Feedback received: ${feedback}` : ''}

Suggest a brief, improved description (1-2 sentences) that reflects the evolved agent's improved capabilities.
Return ONLY the description, no explanations.`;

      const improvedDescription = await llmClient.chat(
        [{ role: 'user', content: metaPrompt }],
        { maxTokens: 256, temperature: 0.6 }
      );

      evolvedAgent.description = improvedDescription.trim();
    } catch (error) {
      console.warn('Failed to evolve description:', error);
      // Keep original description
    }
  }

  return evolvedAgent;
}

// Re-export types for convenience
export type { EvolutionIntensity };
