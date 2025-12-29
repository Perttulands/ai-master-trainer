// Strategy Advisor - Master Trainer's strategy suggestion logic

import { generateWithSystem, isLLMConfigured } from '../api/llm';
import type { CustomStrategy, StrategyMessage } from '../types/strategy';
import { DEFAULT_STRATEGIES } from '../types/strategy';
import { generateId } from '../utils/id';

const STRATEGY_ADVISOR_SYSTEM_PROMPT = `You are the Master Trainer, an expert AI strategist helping users design effective agent training strategies.

Your role is to analyze the user's need and propose 4 distinct, complementary strategies for their AI agent lineages. Each strategy should explore a meaningfully different angle - not just variations of tone, but fundamentally different approaches to solving the problem.

Guidelines for proposing strategies:
1. Each strategy should be genuinely different, not just stylistic variations
2. Consider different user personas, use cases, or problem-solving approaches
3. Think about what would make parallel exploration valuable
4. Name strategies clearly (2-3 words) that capture the essence
5. Provide enough detail for the user to understand the approach

When the user provides feedback, refine the strategies accordingly. Be collaborative and responsive to their input.

IMPORTANT: When proposing or updating strategies, you MUST include a JSON block at the end of your message in this exact format:

\`\`\`strategies
[
  {"label": "A", "name": "Strategy Name", "description": "What this strategy does", "style": "How the agent should behave", "temperature": 0.5},
  {"label": "B", "name": "Strategy Name", "description": "What this strategy does", "style": "How the agent should behave", "temperature": 0.5},
  {"label": "C", "name": "Strategy Name", "description": "What this strategy does", "style": "How the agent should behave", "temperature": 0.5},
  {"label": "D", "name": "Strategy Name", "description": "What this strategy does", "style": "How the agent should behave", "temperature": 0.5}
]
\`\`\`

Temperature guidelines:
- 0.2-0.4: Precise, consistent, deterministic approaches
- 0.5-0.7: Balanced creativity and consistency
- 0.8-1.0: Creative, exploratory, innovative approaches`;

/**
 * Generate initial strategy proposals based on user need
 */
export async function proposeInitialStrategies(
  need: string,
  constraints?: string,
  agentCount: number = 4
): Promise<StrategyMessage> {
  if (!isLLMConfigured()) {
    return generateFallbackProposal(need, agentCount);
  }

  const labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].slice(0, agentCount);
  const labelList = labels.join(', ');

  let userPrompt = `The user wants to create an AI agent for this need:

"${need}"`;

  if (constraints) {
    userPrompt += `

Constraints to consider:
${constraints}`;
  }

  userPrompt += `

Please propose ${agentCount} distinct ${agentCount === 1 ? 'strategy' : 'strategies'} for the agent ${agentCount === 1 ? 'lineage' : 'lineages'} (${labelList}). Each should explore a meaningfully different approach to solving this problem. Explain your thinking and include the strategies JSON block.`;

  try {
    const response = await generateWithSystem(STRATEGY_ADVISOR_SYSTEM_PROMPT, userPrompt, {
      maxTokens: 1024,
      temperature: 0.7,
    });

    const strategies = parseStrategiesFromResponse(response);

    return {
      id: generateId(),
      role: 'assistant',
      content: response,
      timestamp: Date.now(),
      proposedStrategies: strategies,
    };
  } catch (error) {
    console.error('Failed to propose strategies:', error);
    return generateFallbackProposal(need, agentCount);
  }
}

/**
 * Continue the strategy discussion based on user feedback
 */
export async function discussStrategies(
  conversationHistory: StrategyMessage[],
  userMessage: string,
  need: string
): Promise<StrategyMessage> {
  if (!isLLMConfigured()) {
    return {
      id: generateId(),
      role: 'assistant',
      content: "I understand your feedback. Since LLM is not configured, I'll use the default strategies. You can proceed with generation.",
      timestamp: Date.now(),
      proposedStrategies: DEFAULT_STRATEGIES,
    };
  }

  // Build conversation context
  const messages = conversationHistory.map((msg) => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
  }));

  // Add context about the original need
  const contextPrompt = `Remember, the user's original need is: "${need}"

${userMessage}

Please respond to their feedback and update the strategies if needed. Include the updated strategies JSON block.`;

  try {
    const response = await generateWithSystem(
      STRATEGY_ADVISOR_SYSTEM_PROMPT,
      [...messages.map(m => `${m.role}: ${m.content}`), `user: ${contextPrompt}`].join('\n\n'),
      {
        maxTokens: 1024,
        temperature: 0.7,
      }
    );

    const strategies = parseStrategiesFromResponse(response);

    return {
      id: generateId(),
      role: 'assistant',
      content: response,
      timestamp: Date.now(),
      proposedStrategies: strategies.length > 0 ? strategies : undefined,
    };
  } catch (error) {
    console.error('Failed to discuss strategies:', error);
    return {
      id: generateId(),
      role: 'assistant',
      content: "I apologize, but I encountered an error processing your feedback. Please try again or proceed with the current strategies.",
      timestamp: Date.now(),
    };
  }
}

/**
 * Parse strategies from LLM response
 */
function parseStrategiesFromResponse(response: string): CustomStrategy[] {
  // Look for the strategies JSON block
  const strategiesMatch = response.match(/```strategies\s*([\s\S]*?)```/);

  if (strategiesMatch) {
    try {
      const strategiesJson = strategiesMatch[1].trim();
      const parsed = JSON.parse(strategiesJson);
      const allLabels: Array<'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H'> = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

      if (Array.isArray(parsed) && parsed.length >= 1 && parsed.length <= 8) {
        return parsed.map((s, index) => ({
          label: allLabels[index],
          name: s.name || DEFAULT_STRATEGIES[index % 4].name,
          description: s.description || DEFAULT_STRATEGIES[index % 4].description,
          style: s.style || DEFAULT_STRATEGIES[index % 4].style,
          temperature: typeof s.temperature === 'number' ? s.temperature : DEFAULT_STRATEGIES[index % 4].temperature,
        }));
      }
    } catch (e) {
      console.warn('Failed to parse strategies JSON:', e);
    }
  }

  // Try to extract strategies from structured text as fallback
  return extractStrategiesFromText(response);
}

/**
 * Extract strategies from unstructured text (fallback)
 */
function extractStrategiesFromText(response: string): CustomStrategy[] {
  const strategies: CustomStrategy[] = [];
  const labels: Array<'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H'> = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const defaultTemperatures: Record<string, number> = { A: 0.3, B: 0.5, C: 0.9, D: 0.4, E: 0.5, F: 0.6, G: 0.7, H: 0.8 };

  for (const label of labels) {
    // Look for patterns like "Lineage A - Name:" or "**A - Name**" or "A: Name"
    const patterns = [
      new RegExp(`Lineage ${label}[:\\s-]+([^:]+)[:\\s]+([^\\n]+)`, 'i'),
      new RegExp(`\\*\\*${label}[:\\s-]+([^*]+)\\*\\*[:\\s]*([^\\n]+)`, 'i'),
      new RegExp(`\\*\\*Lineage ${label}[:\\s-]+([^*]+)\\*\\*[:\\s]*([^\\n]+)`, 'i'),
    ];

    for (const pattern of patterns) {
      const match = response.match(pattern);
      if (match) {
        const name = match[1].trim().replace(/^\*+|\*+$/g, '');
        const description = match[2].trim();

        strategies.push({
          label,
          name,
          description,
          style: description.toLowerCase(),
          temperature: defaultTemperatures[label] ?? 0.5,
        });
        break;
      }
    }
  }

  // Return strategies if we found any; otherwise return empty to use defaults
  return strategies.length >= 1 ? strategies : [];
}

/**
 * Generate fallback proposal when LLM is unavailable
 */
function generateFallbackProposal(need: string, agentCount: number = 4): StrategyMessage {
  const strategies = DEFAULT_STRATEGIES.slice(0, agentCount);

  const strategyDescriptions = [
    '**Lineage A - Concise**: Focused on delivering clear, brief responses without unnecessary details. Best for users who want quick answers.',
    '**Lineage B - Detailed**: Provides comprehensive, well-structured responses with examples. Ideal for complex topics requiring thorough explanation.',
    '**Lineage C - Creative**: Engages with innovative angles, unique perspectives, and fresh approaches. Great for brainstorming or novel solutions.',
    '**Lineage D - Analytical**: Approaches tasks methodically with step-by-step reasoning. Perfect for technical or data-driven needs.',
  ].slice(0, agentCount);

  const content = `I'll help you design ${agentCount} distinct ${agentCount === 1 ? 'strategy' : 'strategies'} for your agent. Based on your need:

"${need}"

Here ${agentCount === 1 ? 'is my initial proposal' : 'are my initial proposals'}:

${strategyDescriptions.join('\n\n')}

Would you like to adjust ${agentCount === 1 ? 'this strategy' : 'any of these strategies'} to better fit your specific use case?

\`\`\`strategies
${JSON.stringify(strategies, null, 2)}
\`\`\``;

  return {
    id: generateId(),
    role: 'assistant',
    content,
    timestamp: Date.now(),
    proposedStrategies: strategies,
  };
}

/**
 * Format strategies for display (removes JSON block from message)
 */
export function formatStrategyMessage(content: string): string {
  return content.replace(/```strategies[\s\S]*?```/g, '').trim();
}
