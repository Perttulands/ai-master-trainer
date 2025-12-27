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
  constraints?: string
): Promise<StrategyMessage> {
  if (!isLLMConfigured()) {
    return generateFallbackProposal(need);
  }

  let userPrompt = `The user wants to create an AI agent for this need:

"${need}"`;

  if (constraints) {
    userPrompt += `

Constraints to consider:
${constraints}`;
  }

  userPrompt += `

Please propose 4 distinct strategies for the agent lineages (A, B, C, D). Each should explore a meaningfully different approach to solving this problem. Explain your thinking and include the strategies JSON block.`;

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
    return generateFallbackProposal(need);
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

      if (Array.isArray(parsed) && parsed.length === 4) {
        return parsed.map((s, index) => ({
          label: (['A', 'B', 'C', 'D'] as const)[index],
          name: s.name || DEFAULT_STRATEGIES[index].name,
          description: s.description || DEFAULT_STRATEGIES[index].description,
          style: s.style || DEFAULT_STRATEGIES[index].style,
          temperature: typeof s.temperature === 'number' ? s.temperature : DEFAULT_STRATEGIES[index].temperature,
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
  const labels: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D'];

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
          temperature: label === 'A' ? 0.3 : label === 'B' ? 0.5 : label === 'C' ? 0.9 : 0.4,
        });
        break;
      }
    }
  }

  // If we found all 4, return them; otherwise return empty to use defaults
  return strategies.length === 4 ? strategies : [];
}

/**
 * Generate fallback proposal when LLM is unavailable
 */
function generateFallbackProposal(need: string): StrategyMessage {
  const content = `I'll help you design 4 distinct strategies for your agent. Based on your need:

"${need}"

Here are my initial proposals:

**Lineage A - Concise**: Focused on delivering clear, brief responses without unnecessary details. Best for users who want quick answers.

**Lineage B - Detailed**: Provides comprehensive, well-structured responses with examples. Ideal for complex topics requiring thorough explanation.

**Lineage C - Creative**: Engages with innovative angles, unique perspectives, and fresh approaches. Great for brainstorming or novel solutions.

**Lineage D - Analytical**: Approaches tasks methodically with step-by-step reasoning. Perfect for technical or data-driven needs.

Would you like to adjust any of these strategies to better fit your specific use case?

\`\`\`strategies
${JSON.stringify(DEFAULT_STRATEGIES, null, 2)}
\`\`\``;

  return {
    id: generateId(),
    role: 'assistant',
    content,
    timestamp: Date.now(),
    proposedStrategies: DEFAULT_STRATEGIES,
  };
}

/**
 * Format strategies for display (removes JSON block from message)
 */
export function formatStrategyMessage(content: string): string {
  return content.replace(/```strategies[\s\S]*?```/g, '').trim();
}
