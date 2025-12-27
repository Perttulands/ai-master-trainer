/**
 * Credit Assignment Service
 *
 * Determines which agent components are responsible for user feedback.
 * Supports two modes:
 * - Prompt-level credit: For single-call agents, assigns blame to prompt segments
 * - Trajectory credit: For multi-step agents, assigns blame to execution spans
 */

import type {
  ScoreAnalysis,
  FeedbackAspect,
  PromptCredit,
  TrajectoryCredit,
  BlameLevel,
  ExecutionSpan,
} from '../types/evolution';
import type { AgentDefinition } from '../types/agent';
import { llmClient, isLLMConfigured } from '../api/llm';

// Aspect to prompt segment mapping
const ASPECT_SEGMENT_PATTERNS: Record<string, RegExp[]> = {
  length: [
    /\b(comprehensive|detailed|thorough|extensive|brief|concise|short)\b/gi,
    /\b(max|limit|length|word|character|token)\b/gi,
    /\b(expand|elaborate|summarize|shorten)\b/gi,
  ],
  tone: [
    /\b(formal|informal|professional|casual|friendly|polite)\b/gi,
    /\b(tone|voice|style|manner|approach)\b/gi,
  ],
  format: [
    /\b(bullet|list|paragraph|structure|organize|format)\b/gi,
    /\b(markdown|heading|section|numbered)\b/gi,
  ],
  accuracy: [
    /\b(accurate|precise|correct|verify|validate|check)\b/gi,
    /\b(fact|source|reference|citation)\b/gi,
  ],
  completeness: [
    /\b(complete|comprehensive|cover|include|address|missing)\b/gi,
    /\b(all|every|each|full)\b/gi,
  ],
  relevance: [
    /\b(relevant|focus|specific|targeted|related)\b/gi,
    /\b(scope|context|topic)\b/gi,
  ],
  creativity: [
    /\b(creative|original|unique|innovative|novel)\b/gi,
    /\b(idea|approach|solution|perspective)\b/gi,
  ],
};

/**
 * Splits a system prompt into logical segments
 */
function segmentPrompt(prompt: string): string[] {
  // Split by double newlines, bullet points, or numbered lists
  const segments = prompt
    .split(/\n\n+|\n(?=[-*•]|\d+\.)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10); // Filter out very short segments

  // If no natural segments found, split by sentences
  if (segments.length <= 1) {
    return prompt
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10);
  }

  return segments;
}

/**
 * Calculates blame level based on relevance score
 */
function blameLevelFromScore(score: number): BlameLevel {
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'medium';
  if (score >= 0.1) return 'low';
  return 'none';
}

/**
 * Calculates how relevant a segment is to a feedback aspect
 */
function calculateSegmentRelevance(
  segment: string,
  aspect: FeedbackAspect
): number {
  const patterns = ASPECT_SEGMENT_PATTERNS[aspect.aspect] || [];
  let matchCount = 0;
  const totalPatterns = patterns.length;

  for (const pattern of patterns) {
    const matches = segment.match(pattern);
    if (matches) {
      matchCount += matches.length;
    }
  }

  // Base relevance on pattern matches
  if (totalPatterns === 0) return 0;

  // Normalize to 0-1 range
  return Math.min(1, matchCount / (totalPatterns * 2));
}

/**
 * Assigns credit to prompt segments (for single-call agents)
 */
function assignPromptCreditHeuristic(
  prompt: string,
  aspects: FeedbackAspect[]
): PromptCredit[] {
  const segments = segmentPrompt(prompt);
  const credits: PromptCredit[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    let highestRelevance = 0;
    let relatedAspect: string | undefined;
    let reason = 'No direct relation to feedback aspects';

    // Find the most relevant aspect for this segment
    for (const aspect of aspects) {
      const relevance = calculateSegmentRelevance(segment, aspect);
      if (relevance > highestRelevance) {
        highestRelevance = relevance;
        relatedAspect = aspect.aspect;

        // Generate reason based on sentiment
        if (aspect.sentiment === 'negative') {
          reason = `Segment may contribute to ${aspect.aspect} issues${aspect.quote ? `: "${aspect.quote}"` : ''}`;
        } else if (aspect.sentiment === 'positive') {
          reason = `Segment contributes positively to ${aspect.aspect}`;
        }
      }
    }

    credits.push({
      segment,
      segmentIndex: i,
      blame: blameLevelFromScore(highestRelevance),
      relatedAspect,
      reason,
    });
  }

  return credits;
}

/**
 * Uses LLM to assign credit to prompt segments
 */
async function assignPromptCreditWithLLM(
  prompt: string,
  analysis: ScoreAnalysis,
  _agent: AgentDefinition
): Promise<PromptCredit[]> {
  const segments = segmentPrompt(prompt);

  if (segments.length === 0) {
    return [];
  }

  const segmentList = segments
    .map((s, i) => `[${i}] ${s.substring(0, 200)}${s.length > 200 ? '...' : ''}`)
    .join('\n\n');

  const aspectList = analysis.aspects
    .map((a) => `- ${a.aspect} (${a.sentiment}): ${a.quote || 'no quote'}`)
    .join('\n');

  const systemPrompt = `You are an AI prompt analyzer. Your task is to identify which parts of a system prompt are responsible for specific feedback.

Given:
- A segmented system prompt
- User feedback with score ${analysis.score}/10
- Extracted feedback aspects

Analyze which segments relate to the feedback and assign blame levels:
- "high": Segment directly causes the issue
- "medium": Segment contributes to the issue
- "low": Segment weakly relates
- "none": Segment is unrelated

Return JSON array of assignments:
[{"segmentIndex": 0, "blame": "high", "relatedAspect": "length", "reason": "Instructs verbose output"}]`;

  const userPrompt = `System Prompt Segments:
${segmentList}

User Feedback:
Score: ${analysis.score}/10
Comment: ${analysis.comment || '(no comment)'}
Aspects:
${aspectList || '(no specific aspects)'}

Which segments relate to the feedback? Return ONLY the JSON array.`;

  try {
    const response = await llmClient.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { maxTokens: 1024, temperature: 0.3 }
    );

    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON array in response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      segmentIndex: number;
      blame: BlameLevel;
      relatedAspect?: string;
      reason: string;
    }>;

    // Map back to full segments
    return parsed
      .filter((p) => p.segmentIndex >= 0 && p.segmentIndex < segments.length)
      .map((p) => ({
        segment: segments[p.segmentIndex],
        segmentIndex: p.segmentIndex,
        blame: p.blame,
        relatedAspect: p.relatedAspect,
        reason: p.reason,
      }));
  } catch (error) {
    console.warn('LLM credit assignment failed:', error);
    return [];
  }
}

/**
 * Assigns credit to execution spans (for multi-step agents)
 */
function assignTrajectoryCreditHeuristic(
  spans: ExecutionSpan[],
  analysis: ScoreAnalysis
): TrajectoryCredit[] {
  const credits: TrajectoryCredit[] = [];

  // Sort spans by sequence
  const sortedSpans = [...spans].sort((a, b) => a.sequence - b.sequence);

  for (const span of sortedSpans) {
    let contribution = 0;
    let reason = 'Neutral contribution';

    // Analyze span based on type
    switch (span.type) {
      case 'llm_call':
        // LLM calls are usually central to output quality
        contribution = analysis.score >= 5 ? 0.3 : -0.3;
        reason =
          analysis.score >= 5
            ? 'LLM call contributed to acceptable output'
            : 'LLM call may have produced suboptimal content';
        break;

      case 'tool_call':
        // Tool calls - check for errors
        if (span.toolError) {
          contribution = -0.5;
          reason = `Tool call failed: ${span.toolError}`;
        } else {
          contribution = 0.2;
          reason = `Tool ${span.toolName} executed successfully`;
        }
        break;

      case 'tool_result':
        // Tool results inform quality
        if (span.output && span.output.length > 0) {
          contribution = 0.1;
          reason = 'Tool provided useful results';
        }
        break;

      case 'reasoning':
        // Reasoning spans
        contribution = analysis.score >= 5 ? 0.2 : -0.1;
        reason =
          analysis.score >= 5
            ? 'Reasoning step contributed to output'
            : 'Reasoning may have led to suboptimal decisions';
        break;

      case 'output':
        // Output spans are highly relevant
        contribution = analysis.score >= 5 ? 0.5 : -0.5;
        reason =
          analysis.score >= 5
            ? 'Final output was acceptable'
            : 'Final output needs improvement';
        break;
    }

    // Adjust based on specific aspects if matching keywords found
    for (const aspect of analysis.aspects) {
      const combinedText = `${span.input} ${span.output}`.toLowerCase();
      if (combinedText.includes(aspect.aspect)) {
        if (aspect.sentiment === 'negative') {
          contribution -= 0.2;
          reason = `Related to ${aspect.aspect} issue: ${aspect.quote || 'negative feedback'}`;
        } else if (aspect.sentiment === 'positive') {
          contribution += 0.2;
          reason = `Related to ${aspect.aspect}: positive feedback`;
        }
        break;
      }
    }

    // Clamp contribution to [-1, 1]
    contribution = Math.max(-1, Math.min(1, contribution));

    credits.push({
      spanId: span.id,
      contribution,
      reason,
    });
  }

  return credits;
}

/**
 * Main credit assignment function
 * Chooses between prompt-level and trajectory-level based on span count
 */
export async function assignCredit(
  agent: AgentDefinition,
  analysis: ScoreAnalysis,
  spans: ExecutionSpan[] = []
): Promise<{ mode: 'prompt' | 'trajectory'; credits: PromptCredit[] | TrajectoryCredit[] }> {
  // Use trajectory credit for multi-step agents (more than 1 LLM call)
  const llmCallCount = spans.filter((s) => s.type === 'llm_call').length;

  if (llmCallCount > 1 && spans.length >= 3) {
    // Multi-step agent - use trajectory credit
    const credits = assignTrajectoryCreditHeuristic(spans, analysis);
    return { mode: 'trajectory', credits };
  }

  // Single-call or no spans - use prompt-level credit
  let credits: PromptCredit[];

  // Try LLM-based credit assignment first
  if (isLLMConfigured() && analysis.aspects.length > 0) {
    credits = await assignPromptCreditWithLLM(agent.systemPrompt, analysis, agent);
    if (credits.length > 0) {
      return { mode: 'prompt', credits };
    }
  }

  // Fall back to heuristic-based credit assignment
  credits = assignPromptCreditHeuristic(agent.systemPrompt, analysis.aspects);
  return { mode: 'prompt', credits };
}

/**
 * Gets the highest-blame prompt credits for targeted evolution
 */
export function getHighBlameSegments(credits: PromptCredit[]): PromptCredit[] {
  return credits.filter((c) => c.blame === 'high' || c.blame === 'medium');
}

/**
 * Gets problematic spans for targeted evolution
 */
export function getProblematicSpans(credits: TrajectoryCredit[]): TrajectoryCredit[] {
  return credits.filter((c) => c.contribution < 0);
}

/**
 * Determines if trajectory-based credit assignment should be used
 * based on the execution spans
 */
export function shouldUseTrajectoryCredit(spans: ExecutionSpan[]): boolean {
  if (!spans || spans.length < 3) {
    return false;
  }

  // Count LLM calls - trajectory credit is useful when there are multiple
  const llmCallCount = spans.filter((s) => s.type === 'llm_call').length;

  return llmCallCount > 1;
}

/**
 * Gets a summary of execution spans for logging
 */
export function summarizeSpans(spans: ExecutionSpan[]): string {
  if (!spans || spans.length === 0) {
    return 'No execution spans';
  }

  const typeCounts: Record<string, number> = {};
  for (const span of spans) {
    typeCounts[span.type] = (typeCounts[span.type] || 0) + 1;
  }

  const parts: string[] = [`${spans.length} total spans`];
  for (const [type, count] of Object.entries(typeCounts)) {
    parts.push(`${count} ${type}`);
  }

  return parts.join(', ');
}

/**
 * Summarizes credit assignment for logging
 */
export function summarizeCreditAssignment(
  credits: PromptCredit[] | TrajectoryCredit[]
): string {
  if (credits.length === 0) {
    return 'No credit assigned';
  }

  // Check if prompt credits
  if ('segment' in credits[0]) {
    const promptCredits = credits as PromptCredit[];
    const highBlame = promptCredits.filter((c) => c.blame === 'high');
    const mediumBlame = promptCredits.filter((c) => c.blame === 'medium');

    return [
      `Analyzed ${promptCredits.length} prompt segments`,
      highBlame.length > 0
        ? `High blame: ${highBlame.map((c) => c.relatedAspect || 'unspecified').join(', ')}`
        : null,
      mediumBlame.length > 0
        ? `Medium blame: ${mediumBlame.map((c) => c.relatedAspect || 'unspecified').join(', ')}`
        : null,
    ]
      .filter(Boolean)
      .join('. ');
  }

  // Trajectory credits
  const trajCredits = credits as TrajectoryCredit[];
  const problematic = trajCredits.filter((c) => c.contribution < 0);
  const helpful = trajCredits.filter((c) => c.contribution > 0.3);

  return [
    `Analyzed ${trajCredits.length} execution spans`,
    problematic.length > 0 ? `${problematic.length} problematic spans` : null,
    helpful.length > 0 ? `${helpful.length} helpful spans` : null,
  ]
    .filter(Boolean)
    .join('. ');
}
