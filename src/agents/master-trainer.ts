// Master Trainer - Uses LiteLLM for real AI-powered lineage evolution

import { generateWithSystem, isLLMConfigured } from "../api/llm";
import type { Lineage, LineageLabel, TrainerMessage } from "../types";
import { generateId } from "../utils/id";
import type { TrainerAction } from "../types";

/**
 * Propose an initial input prompt for testing agents
 * The input prompt is the actual task/query that agents will respond to
 */
export async function proposeInputPrompt(
  need: string,
  constraints?: string
): Promise<string> {
  if (!isLLMConfigured()) {
    return generateFallbackInputPrompt(need, constraints);
  }

  const systemPrompt = `You are an expert at designing test inputs for AI agents.

Given a user's need (what kind of agent they want) and optional constraints, propose a realistic, concrete INPUT PROMPT that should be sent to the agent to test its capabilities.

The input prompt should:
1. Be a realistic user request that the agent would receive
2. Test the core capability described in the need
3. Be specific enough to evaluate quality (not too vague)
4. Be concise - just the input, no meta-commentary

Output ONLY the input prompt text - nothing else.`;

  let userPrompt = `Need: "${need}"`;
  if (constraints) {
    userPrompt += `\nConstraints: ${constraints}`;
  }
  userPrompt += `\n\nPropose a test input prompt:`;

  try {
    const result = await generateWithSystem(systemPrompt, userPrompt, {
      maxTokens: 256,
      temperature: 0.7,
    });
    return result.trim();
  } catch (error) {
    console.error("Failed to propose input prompt:", error);
    return generateFallbackInputPrompt(need, constraints);
  }
}

function generateFallbackInputPrompt(
  need: string,
  constraints?: string
): string {
  // Create a simple but concrete input based on the need
  const needLower = need.toLowerCase();

  if (needLower.includes("poem") || needLower.includes("poetry")) {
    return "Write a poem about the changing seasons and the passage of time.";
  }
  if (needLower.includes("email") || needLower.includes("mail")) {
    return "Write a professional email declining a meeting invitation due to a schedule conflict.";
  }
  if (needLower.includes("summary") || needLower.includes("summarize")) {
    return "Summarize the key benefits of renewable energy in 3-4 sentences.";
  }
  if (needLower.includes("code") || needLower.includes("programming")) {
    return "Write a function that validates an email address and returns true or false.";
  }
  if (needLower.includes("story") || needLower.includes("narrative")) {
    return "Write a short story about a traveler who discovers something unexpected.";
  }
  if (needLower.includes("explain") || needLower.includes("teaching")) {
    return "Explain how photosynthesis works in simple terms a child could understand.";
  }

  // Generic fallback that references the need
  return `Please help me with the following: ${need}${constraints ? ` (keeping in mind: ${constraints})` : ""}`;
}

// Strategy definitions for initial lineage generation (up to 8 lineages)
const STRATEGIES: Record<LineageLabel, { tag: string; description: string }> = {
  A: {
    tag: "Concise",
    description:
      "Brief, focused, gets straight to the point with minimal words",
  },
  B: {
    tag: "Detailed",
    description: "Comprehensive, thorough, covers all aspects in depth",
  },
  C: {
    tag: "Creative",
    description:
      "Innovative, engaging, uses unique angles and fresh perspectives",
  },
  D: {
    tag: "Analytical",
    description: "Structured, logical, data-focused with clear organization",
  },
  E: {
    tag: "Empathetic",
    description:
      "Warm, understanding, considers emotional context and user feelings",
  },
  F: {
    tag: "Formal",
    description:
      "Professional, polished, follows formal conventions and standards",
  },
  G: {
    tag: "Casual",
    description:
      "Relaxed, conversational, uses informal and approachable language",
  },
  H: {
    tag: "Hybrid",
    description: "Balanced blend of multiple approaches, adaptable to context",
  },
};

// All possible labels in order
const ALL_LABELS: LineageLabel[] = ["A", "B", "C", "D", "E", "F", "G", "H"];

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
  constraints?: string,
  count: number = 4
): Promise<InitialLineageConfig[]> {
  if (!isLLMConfigured()) {
    console.warn("LLM not configured, using fallback generation");
    return generateFallbackLineages(need, constraints, count);
  }

  const labels = ALL_LABELS.slice(0, count);

  // Generate lineages in parallel for speed
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
        content: generateFallbackContent(
          need,
          strategy.description,
          constraints
        ),
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
    const content = await generateWithSystem(
      EVOLUTION_SYSTEM_PROMPT,
      userPrompt,
      {
        maxTokens: 1024,
        temperature: previousScore < 5 ? 0.9 : 0.7, // More creative for low scores
      }
    );

    return content.trim();
  } catch (error) {
    console.error(`Failed to evolve lineage ${lineage.label}:`, error);
    return generateFallbackEvolution(lineage, need, previousScore, cycle);
  }
}

/** Rich context for trainer chat with full lineage information */
export interface TrainerChatContext {
  need: string;
  lineages: Array<{
    id: string;
    label: LineageLabel;
    cycle: number;
    isLocked: boolean;
    score?: number;
    comment?: string;
    stickyDirective?: string;
    content?: string; // Full artifact content for best proposals
  }>;
}

export async function respondToChat(
  userMessage: string,
  sessionContext: TrainerChatContext
): Promise<TrainerMessage> {
  const lineageSummary = sessionContext.lineages
    .map((l) => {
      const parts = [`${l.label} (id: ${l.id}, Cycle ${l.cycle})`];
      if (l.isLocked) parts.push("LOCKED");
      if (l.score !== undefined) parts.push(`Score: ${l.score}/10`);
      if (l.comment)
        parts.push(`Comment: "${truncateForPrompt(l.comment, 200)}"`);
      if (l.stickyDirective)
        parts.push(`Directive: "${truncateForPrompt(l.stickyDirective, 200)}"`);
      if (l.content)
        parts.push(`Latest output: "${truncateForPrompt(l.content, 400)}"`);
      return `- Lineage ${parts.join(", ")}`;
    })
    .join("\n");

  const systemPrompt = `You are the Master Trainer, an AI assistant helping users train and evolve AI outputs in Training Camp. You can observe and propose actions to help the user.

Current session:
- Need: "${sessionContext.need}"
- Lineages:
${lineageSummary}

You can:
1. Provide advice and guidance (just respond naturally)
2. Propose specific actions for the user to approve

When you want to propose actions, include a JSON block at the end of your message:

\`\`\`actions
[
  {"kind": "set_grade", "lineageId": "...", "agentLabel": "A", "grade": 8},
  {"kind": "set_directive", "lineageId": "...", "agentLabel": "C", "directive": {"type": "sticky", "content": "Be more concise"}},
  {"kind": "set_directive", "lineageId": "...", "agentLabel": "B", "directive": {"type": "oneshot", "content": "Fix the tone in the next version"}},
  {"kind": "add_lineage", "count": 1}
]
\`\`\`

Action types:
- set_grade: Set a score (1-10) for a lineage
- set_directive: Set a sticky or oneshot directive. Use "oneshot" for specific feedback on the current output that should be addressed in the next cycle. Use "sticky" for permanent rules.
- add_lineage: Add new agents to the session

Only propose actions when relevant to the user's request. Most responses should just be helpful advice.`;

  if (!isLLMConfigured()) {
    return generateFallbackChatResponse(sessionContext);
  }

  try {
    const content = await generateWithSystem(systemPrompt, userMessage, {
      maxTokens: 1024,
      temperature: 0.7,
    });

    // Parse actions from response
    const actions = parseActionsFromResponse(content, sessionContext.lineages);

    return {
      id: generateId(),
      role: "assistant",
      content: formatTrainerMessage(content),
      timestamp: Date.now(),
      actions: actions.length > 0 ? actions : undefined,
    };
  } catch (error) {
    console.error("Chat error:", error);
    return generateFallbackChatResponse(sessionContext);
  }
}

/**
 * Parse actions JSON block from trainer response
 */
function parseActionsFromResponse(
  response: string,
  lineages: TrainerChatContext["lineages"]
): TrainerAction[] {
  const actionsMatch = response.match(/```actions\s*([\s\S]*?)```/);
  if (!actionsMatch) return [];

  try {
    const actionsJson = actionsMatch[1].trim();
    const parsed = JSON.parse(actionsJson);

    if (!Array.isArray(parsed)) return [];

    // Validate, resolve lineage IDs, and drop anything unsafe.
    const resolved: TrainerAction[] = [];

    for (const rawAction of parsed) {
      if (!rawAction || typeof rawAction !== "object") continue;
      const action = rawAction as Record<string, unknown>;
      const kind = action.kind;
      if (typeof kind !== "string") continue;

      if (kind === "add_lineage") {
        const count = action.count;
        if (!Number.isFinite(count) || (count as number) < 1) continue;
        resolved.push({
          kind: "add_lineage",
          count: Math.floor(count as number),
        });
        continue;
      }

      // Lineage-scoped actions must resolve to a real lineage id.
      const candidateLineageId =
        typeof action.lineageId === "string"
          ? (action.lineageId as string)
          : null;
      const candidateAgentLabel =
        typeof action.agentLabel === "string"
          ? (action.agentLabel as string)
          : null;

      const lineage =
        (candidateLineageId &&
          lineages.find((l) => l.id === candidateLineageId)) ||
        (candidateAgentLabel &&
          lineages.find((l) => l.label === candidateAgentLabel));

      if (!lineage) continue;

      if (kind === "set_grade") {
        const grade = action.grade;
        if (
          !Number.isFinite(grade) ||
          (grade as number) < 1 ||
          (grade as number) > 10
        )
          continue;
        resolved.push({
          kind: "set_grade",
          lineageId: lineage.id,
          agentLabel: lineage.label,
          grade: Math.round(grade as number),
        });
        continue;
      }

      if (kind === "add_comment") {
        const comment = action.comment;
        if (typeof comment !== "string" || comment.trim().length === 0)
          continue;
        // Convert comment to oneshot directive
        resolved.push({
          kind: "set_directive",
          lineageId: lineage.id,
          agentLabel: lineage.label,
          directive: { type: "oneshot", content: comment.trim() },
        });
        continue;
      }

      if (kind === "set_directive") {
        const directive = action.directive;
        if (!directive || typeof directive !== "object") continue;
        const dir = directive as Record<string, unknown>;
        const type = dir.type;
        const content = dir.content;
        if (type !== "sticky" && type !== "oneshot") continue;
        if (typeof content !== "string" || content.trim().length === 0)
          continue;
        resolved.push({
          kind: "set_directive",
          lineageId: lineage.id,
          agentLabel: lineage.label,
          directive: { type, content: content.trim() },
        });
        continue;
      }
    }

    return resolved;
  } catch (e) {
    console.warn("Failed to parse actions JSON:", e);
    return [];
  }
}

/**
 * Remove actions block from message for display
 */
function formatTrainerMessage(content: string): string {
  return content.replace(/```actions[\s\S]*?```/g, "").trim();
}

function truncateForPrompt(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1))}…`;
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

  prompt += "\n\nGenerate the artifact now:";
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
    prompt +=
      "\n\nThe low score indicates significant changes are needed. Try a fresh approach while maintaining the strategy style.";
  } else if (previousScore >= 8) {
    prompt +=
      "\n\nThe high score indicates the approach is working well. Refine and polish while keeping the core intact.";
  } else {
    prompt +=
      "\n\nModerate score - improve on the previous attempt while addressing likely weaknesses.";
  }

  prompt += "\n\nGenerate the evolved artifact:";
  return prompt;
}

// Fallback functions when LLM is not available

function generateFallbackLineages(
  need: string,
  constraints?: string,
  count: number = 4
): InitialLineageConfig[] {
  const labels = ALL_LABELS.slice(0, count);
  return labels.map((label) => {
    const strategy = STRATEGIES[label];
    return {
      label,
      strategyTag: strategy.tag,
      content: generateFallbackContent(need, strategy.description, constraints),
    };
  });
}

function generateFallbackContent(
  need: string,
  style: string,
  constraints?: string
): string {
  const constraintNote = constraints ? `\n\nConstraints: ${constraints}` : "";
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
  let evolutionNote = "";

  if (previousScore >= 8) {
    evolutionNote =
      "Refined based on high score - polishing the successful approach";
  } else if (previousScore >= 5) {
    evolutionNote =
      "Improved based on moderate score - addressing potential weaknesses";
  } else {
    evolutionNote =
      "Significantly revised based on low score - trying a fresh angle";
  }

  const directiveNote = lineage.directiveSticky
    ? `\nApplying sticky directive: "${lineage.directiveSticky}"`
    : "";
  const oneshotNote = lineage.directiveOneshot
    ? `\nApplying one-shot directive: "${lineage.directiveOneshot}"`
    : "";

  return `[CYCLE ${cycle} - ${strategy.tag.toUpperCase()} EVOLUTION]

${evolutionNote}${directiveNote}${oneshotNote}

Addressing: "${need}"

This is cycle ${cycle} of the ${strategy.tag.toLowerCase()} lineage. The artifact has been evolved based on your score of ${previousScore}/10.

Strategy: ${strategy.tag}
Previous Score: ${previousScore}/10

To enable real AI evolution, configure the LLM API in your environment.`;
}

function generateFallbackChatResponse(
  sessionContext: TrainerChatContext
): TrainerMessage {
  const lineagesCount = sessionContext.lineages.length;
  const currentCycle = sessionContext.lineages[0]?.cycle ?? 0;

  const responses = [
    `I'm here to help you train outputs for: "${sessionContext.need}". Score your ${lineagesCount} lineages and lock the best ones. Unlocked lineages will evolve based on your feedback.`,
    `Tip: Use scores 8-10 for outputs that are close to what you want. Scores 1-4 signal that you want a completely different approach.`,
    `At cycle ${currentCycle}, consider which lineages are trending in the right direction. Lock early winners to preserve them while exploring alternatives.`,
    `Try adding a directive to guide evolution. Sticky directives persist across cycles, while one-shot directives apply only to the next generation.`,
  ];

  return {
    id: generateId(),
    role: "assistant",
    content: responses[Math.floor(Math.random() * responses.length)],
    timestamp: Date.now(),
  };
}

// Export strategy info for UI use
export function getStrategyInfo(label: LineageLabel): {
  tag: string;
  description: string;
} {
  return STRATEGIES[label];
}

export function getAllStrategies(): typeof STRATEGIES {
  return STRATEGIES;
}

// Get the next available label given existing labels
export function getNextAvailableLabel(
  existingLabels: LineageLabel[]
): LineageLabel | null {
  for (const label of ALL_LABELS) {
    if (!existingLabels.includes(label)) {
      return label;
    }
  }
  return null; // All labels used
}

// Generate a single new lineage for adding mid-session
export async function generateSingleLineage(
  need: string,
  label: LineageLabel,
  constraints?: string
): Promise<InitialLineageConfig> {
  const strategy = STRATEGIES[label];

  if (!isLLMConfigured()) {
    return {
      label,
      strategyTag: strategy.tag,
      content: generateFallbackContent(need, strategy.description, constraints),
    };
  }

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
    return {
      label,
      strategyTag: strategy.tag,
      content: generateFallbackContent(need, strategy.description, constraints),
    };
  }
}
