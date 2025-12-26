// Master Trainer - Uses LiteLLM for real AI-powered lineage evolution

import { generateWithSystem, isLLMConfigured } from '../api/llm';
import type { Lineage, LineageLabel, TrainerMessage } from '../types';
import { generateId } from '../utils/id';

// Strategy definitions for initial lineage generation
const STRATEGIES: Record<LineageLabel, { tag: string; description: string }> = {
  A: { tag: 'Concise', description: 'Brief, focused, gets straight to the point with minimal words' },
  B: { tag: 'Detailed', description: 'Comprehensive, thorough, covers all aspects in depth' },
  C: { tag: 'Creative', description: 'Innovative, engaging, uses unique angles and fresh perspectives' },
  D: { tag: 'Analytical', description: 'Structured, logical, data-focused with clear organization' },
};

const SYSTEM_PROMPT = `You are an expert AI content generator for Training Camp, a system that helps users create and refine AI outputs through iterative evolution.

Your role is to generate high-quality content artifacts based on user needs and constraints. Each artifact should be practical, useful, and directly address the stated need.

When generating content:
1. Focus on the core need - what the user actually wants to accomplish
2. Apply the specified strategy/style consistently
3. Consider any constraints provided
4. Make the output immediately usable, not theoretical
5. Be specific and concrete, not vague or generic

Output ONLY the artifact content itself - no meta-commentary, explanations, or preamble.`;

const EVOLUTION_SYSTEM_PROMPT = `You are an expert AI content evolver for Training Camp. Your job is to improve content based on user feedback (scores and directives).

Evolution Rules:
- Score 8-10: Refine and polish, keep the core approach
- Score 5-7: Make moderate improvements, address likely pain points
- Score 1-4: Take a significantly different approach while maintaining the strategy style
- Apply any directives (sticky or one-shot) as specific guidance
- Maintain consistency with the lineage's strategy tag

Output ONLY the evolved artifact content - no explanations or meta-commentary.`;

export interface InitialLineageConfig {
  label: LineageLabel;
  strategyTag: string;
  content: string;
}

export async function generateInitialLineages(
  need: string,
  constraints?: string
): Promise<InitialLineageConfig[]> {
  if (!isLLMConfigured()) {
    console.warn('LLM not configured, using fallback generation');
    return generateFallbackLineages(need, constraints);
  }

  const labels: LineageLabel[] = ['A', 'B', 'C', 'D'];

  // Generate all 4 lineages in parallel for speed
  const promises = labels.map(async (label) => {
    const strategy = STRATEGIES[label];
    const userPrompt = buildGenerationPrompt(need, strategy, constraints);

    try {
      const content = await generateWithSystem(SYSTEM_PROMPT, userPrompt, {
        maxTokens: 1024,
        temperature: 0.8,
      });

      return {
        label,
        strategyTag: strategy.tag,
        content: content.trim(),
      };
    } catch (error) {
      console.error(`Failed to generate lineage ${label}:`, error);
      // Return fallback content on error
      return {
        label,
        strategyTag: strategy.tag,
        content: generateFallbackContent(need, strategy.description, constraints),
      };
    }
  });

  const generated = await Promise.all(promises);
  return generated;
}

export async function evolveLineage(
  lineage: Lineage,
  need: string,
  previousScore: number,
  previousContent: string,
  cycle: number
): Promise<string> {
  if (!isLLMConfigured()) {
    return generateFallbackEvolution(lineage, need, previousScore, cycle);
  }

  const strategy = STRATEGIES[lineage.label];
  const userPrompt = buildEvolutionPrompt(
    need,
    strategy,
    previousScore,
    previousContent,
    lineage.directiveSticky,
    lineage.directiveOneshot,
    cycle
  );

  try {
    const content = await generateWithSystem(EVOLUTION_SYSTEM_PROMPT, userPrompt, {
      maxTokens: 1024,
      temperature: previousScore < 5 ? 0.9 : 0.7, // More creative for low scores
    });

    return content.trim();
  } catch (error) {
    console.error(`Failed to evolve lineage ${lineage.label}:`, error);
    return generateFallbackEvolution(lineage, need, previousScore, cycle);
  }
}

export async function respondToChat(
  userMessage: string,
  sessionContext: { need: string; lineagesCount: number; currentCycle: number }
): Promise<TrainerMessage> {
  const systemPrompt = `You are the Master Trainer, an AI assistant helping users train and evolve AI outputs in Training Camp.

Current session context:
- Need: "${sessionContext.need}"
- Active lineages: ${sessionContext.lineagesCount}
- Current cycle: ${sessionContext.currentCycle}

Be helpful, concise, and focused on guiding the user to get better results. Provide actionable advice about:
- How to score artifacts effectively
- When to lock vs continue evolving lineages
- How to use directives (sticky for persistent guidance, one-shot for experiments)
- Strategies for getting the output they want`;

  if (!isLLMConfigured()) {
    return generateFallbackChatResponse(sessionContext);
  }

  try {
    const content = await generateWithSystem(systemPrompt, userMessage, {
      maxTokens: 512,
      temperature: 0.7,
    });

    return {
      id: generateId(),
      role: 'assistant',
      content: content.trim(),
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('Chat error:', error);
    return generateFallbackChatResponse(sessionContext);
  }
}

// Helper functions for prompt building

function buildGenerationPrompt(
  need: string,
  strategy: { tag: string; description: string },
  constraints?: string
): string {
  let prompt = `Generate content for this need: "${need}"

Strategy: ${strategy.tag} - ${strategy.description}`;

  if (constraints) {
    prompt += `\n\nConstraints to follow:\n${constraints}`;
  }

  prompt += '\n\nGenerate the artifact now:';
  return prompt;
}

function buildEvolutionPrompt(
  need: string,
  strategy: { tag: string; description: string },
  previousScore: number,
  previousContent: string,
  stickyDirective: string | null,
  oneshotDirective: string | null,
  cycle: number
): string {
  let prompt = `Evolve this content for cycle ${cycle}.

Original need: "${need}"
Strategy: ${strategy.tag} - ${strategy.description}
Previous score: ${previousScore}/10

Previous content:
---
${previousContent}
---`;

  if (stickyDirective) {
    prompt += `\n\nPersistent directive (always apply): ${stickyDirective}`;
  }

  if (oneshotDirective) {
    prompt += `\n\nOne-time directive (apply this cycle only): ${oneshotDirective}`;
  }

  if (previousScore < 5) {
    prompt += '\n\nThe low score indicates significant changes are needed. Try a fresh approach while maintaining the strategy style.';
  } else if (previousScore >= 8) {
    prompt += '\n\nThe high score indicates the approach is working well. Refine and polish while keeping the core intact.';
  } else {
    prompt += '\n\nModerate score - improve on the previous attempt while addressing likely weaknesses.';
  }

  prompt += '\n\nGenerate the evolved artifact:';
  return prompt;
}

// Fallback functions when LLM is not available

function generateFallbackLineages(need: string, constraints?: string): InitialLineageConfig[] {
  const labels: LineageLabel[] = ['A', 'B', 'C', 'D'];
  return labels.map((label) => {
    const strategy = STRATEGIES[label];
    return {
      label,
      strategyTag: strategy.tag,
      content: generateFallbackContent(need, strategy.description, constraints),
    };
  });
}

function generateFallbackContent(need: string, style: string, constraints?: string): string {
  const constraintNote = constraints ? `\n\nConstraints: ${constraints}` : '';
  return `[${style.toUpperCase()} APPROACH]

Addressing: "${need}"

This is a placeholder artifact generated without LLM access. In production, this would be a fully realized ${style} response to your need.

Key elements this artifact would include:
- Direct response to the stated need
- ${style} characteristics throughout
- Practical, actionable content
- Ready for immediate use${constraintNote}

To enable AI-powered generation, configure VITE_LITELLM_API_BASE and VITE_LITELLM_API_KEY in your environment.`;
}

function generateFallbackEvolution(
  lineage: Lineage,
  need: string,
  previousScore: number,
  cycle: number
): string {
  const strategy = STRATEGIES[lineage.label];
  let evolutionNote = '';

  if (previousScore >= 8) {
    evolutionNote = 'Refined based on high score - polishing the successful approach';
  } else if (previousScore >= 5) {
    evolutionNote = 'Improved based on moderate score - addressing potential weaknesses';
  } else {
    evolutionNote = 'Significantly revised based on low score - trying a fresh angle';
  }

  const directiveNote = lineage.directiveSticky
    ? `\nApplying sticky directive: "${lineage.directiveSticky}"`
    : '';
  const oneshotNote = lineage.directiveOneshot
    ? `\nApplying one-shot directive: "${lineage.directiveOneshot}"`
    : '';

  return `[CYCLE ${cycle} - ${strategy.tag.toUpperCase()} EVOLUTION]

${evolutionNote}${directiveNote}${oneshotNote}

Addressing: "${need}"

This is cycle ${cycle} of the ${strategy.tag.toLowerCase()} lineage. The artifact has been evolved based on your score of ${previousScore}/10.

Strategy: ${strategy.tag}
Previous Score: ${previousScore}/10

To enable real AI evolution, configure the LLM API in your environment.`;
}

function generateFallbackChatResponse(
  sessionContext: { need: string; lineagesCount: number; currentCycle: number }
): TrainerMessage {
  const responses = [
    `I'm here to help you train outputs for: "${sessionContext.need}". Score your ${sessionContext.lineagesCount} lineages and lock the best ones. Unlocked lineages will evolve based on your feedback.`,
    `Tip: Use scores 8-10 for outputs that are close to what you want. Scores 1-4 signal that you want a completely different approach.`,
    `At cycle ${sessionContext.currentCycle}, consider which lineages are trending in the right direction. Lock early winners to preserve them while exploring alternatives.`,
    `Try adding a directive to guide evolution. Sticky directives persist across cycles, while one-shot directives apply only to the next generation.`,
  ];

  return {
    id: generateId(),
    role: 'assistant',
    content: responses[Math.floor(Math.random() * responses.length)],
    timestamp: Date.now(),
  };
}

// Export strategy info for UI use
export function getStrategyInfo(label: LineageLabel): { tag: string; description: string } {
  return STRATEGIES[label];
}

export function getAllStrategies(): typeof STRATEGIES {
  return STRATEGIES;
}
