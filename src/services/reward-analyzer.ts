/**
 * Reward Analyzer Service
 *
 * Parses user scores and comments into structured ScoreAnalysis.
 * Part of the Agent Lightning evolution pipeline.
 */

import type {
  ScoreAnalysis,
  FeedbackAspect,
  Sentiment,
  Trend,
} from '../types/evolution';
import { llmClient, isLLMConfigured } from '../api/llm';

// Common feedback aspects with associated keywords
const ASPECT_KEYWORDS: Record<string, string[]> = {
  length: [
    'long',
    'short',
    'brief',
    'verbose',
    'concise',
    'wordy',
    'lengthy',
    'too much',
    'not enough',
    'more detail',
    'less detail',
  ],
  tone: [
    'formal',
    'informal',
    'casual',
    'professional',
    'friendly',
    'cold',
    'warm',
    'harsh',
    'polite',
    'rude',
  ],
  accuracy: [
    'wrong',
    'correct',
    'accurate',
    'inaccurate',
    'mistake',
    'error',
    'right',
    'incorrect',
    'precise',
    'imprecise',
  ],
  format: [
    'bullets',
    'list',
    'paragraph',
    'structured',
    'organized',
    'messy',
    'clear',
    'confusing',
    'readable',
    'format',
  ],
  completeness: [
    'incomplete',
    'complete',
    'missing',
    'thorough',
    'partial',
    'full',
    'comprehensive',
    'lacking',
  ],
  relevance: [
    'relevant',
    'irrelevant',
    'off-topic',
    'on-point',
    'tangent',
    'focused',
    'scattered',
    'related',
  ],
  speed: [
    'slow',
    'fast',
    'quick',
    'delayed',
    'immediate',
    'responsive',
  ],
  creativity: [
    'creative',
    'boring',
    'original',
    'generic',
    'unique',
    'standard',
    'innovative',
    'bland',
  ],
};

// Keywords that indicate positive/negative sentiment
const POSITIVE_INDICATORS = [
  'good',
  'great',
  'excellent',
  'perfect',
  'love',
  'like',
  'better',
  'best',
  'well',
  'nice',
  'helpful',
  'useful',
  'thanks',
  'awesome',
  'amazing',
  'improved',
  'correct',
  'right',
];

const NEGATIVE_INDICATORS = [
  'bad',
  'terrible',
  'awful',
  'hate',
  'wrong',
  'worse',
  'worst',
  'poor',
  'useless',
  'unhelpful',
  'incorrect',
  'mistake',
  'error',
  'fail',
  'broken',
  'confused',
  'unclear',
  'missing',
];

/**
 * Determines overall sentiment from score
 */
function getSentimentFromScore(score: number): Sentiment {
  if (score >= 7) return 'positive';
  if (score >= 4) return 'neutral';
  return 'negative';
}

/**
 * Determines trend from score history
 */
function calculateTrend(
  currentScore: number,
  previousScore: number | null
): { trend: Trend; delta: number } {
  if (previousScore === null) {
    return { trend: 'stable', delta: 0 };
  }

  const delta = currentScore - previousScore;

  if (delta >= 2) return { trend: 'improving', delta };
  if (delta <= -2) return { trend: 'declining', delta };
  return { trend: 'stable', delta };
}

/**
 * Extracts feedback aspects using keyword matching (fallback method)
 */
function extractAspectsFromKeywords(comment: string): FeedbackAspect[] {
  const aspects: FeedbackAspect[] = [];
  const lowerComment = comment.toLowerCase();

  for (const [aspect, keywords] of Object.entries(ASPECT_KEYWORDS)) {
    for (const keyword of keywords) {
      const index = lowerComment.indexOf(keyword);
      if (index !== -1) {
        // Find the surrounding context (up to 50 chars before and after)
        const start = Math.max(0, index - 30);
        const end = Math.min(comment.length, index + keyword.length + 30);
        const quote = comment.substring(start, end).trim();

        // Determine sentiment based on surrounding words
        const contextStart = Math.max(0, index - 20);
        const contextEnd = Math.min(lowerComment.length, index + keyword.length + 20);
        const context = lowerComment.substring(contextStart, contextEnd);

        const hasNegation =
          context.includes('not ') ||
          context.includes("n't ") ||
          context.includes('no ');
        const hasPositive = POSITIVE_INDICATORS.some((p) => context.includes(p));
        const hasNegative = NEGATIVE_INDICATORS.some((n) => context.includes(n));

        let sentiment: Sentiment;
        if (hasNegation) {
          sentiment = hasNegative ? 'positive' : 'negative';
        } else {
          sentiment = hasNegative ? 'negative' : hasPositive ? 'positive' : 'neutral';
        }

        // Avoid duplicates
        if (!aspects.some((a) => a.aspect === aspect)) {
          aspects.push({
            aspect,
            sentiment,
            quote: quote.length > 3 ? `...${quote}...` : undefined,
            confidence: 0.6,
          });
        }
        break;
      }
    }
  }

  return aspects;
}

/**
 * Extracts feedback aspects using LLM (primary method)
 */
async function extractAspectsWithLLM(
  comment: string,
  score: number
): Promise<FeedbackAspect[]> {
  const prompt = `Analyze this user feedback for an AI agent output and extract specific aspects being commented on.

Score: ${score}/10
Comment: "${comment}"

Extract each distinct aspect mentioned (e.g., length, tone, accuracy, format, completeness, relevance, creativity).
For each aspect, determine:
1. The aspect name (lowercase, one word)
2. Whether the sentiment is positive, negative, or neutral
3. A relevant quote from the comment (if applicable)
4. Confidence level (0-1)

Return as JSON array:
[{"aspect": "length", "sentiment": "negative", "quote": "too long", "confidence": 0.9}]

If no specific aspects are mentioned, return an empty array [].
Return ONLY the JSON array, no other text.`;

  try {
    const response = await llmClient.chat(
      [{ role: 'user', content: prompt }],
      { maxTokens: 512, temperature: 0.3 }
    );

    // Parse JSON response
    const cleaned = response.trim();
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      aspect: string;
      sentiment: string;
      quote?: string;
      confidence: number;
    }>;

    return parsed.map((p) => ({
      aspect: p.aspect.toLowerCase(),
      sentiment: (p.sentiment as Sentiment) || 'neutral',
      quote: p.quote,
      confidence: Math.max(0, Math.min(1, p.confidence)),
    }));
  } catch (error) {
    console.warn('LLM aspect extraction failed:', error);
    return [];
  }
}

/**
 * Analyzes a user score and comment into structured feedback
 */
export async function analyzeReward(
  score: number,
  comment: string | null | undefined,
  previousScore: number | null = null
): Promise<ScoreAnalysis> {
  // Calculate trend
  const { trend, delta } = calculateTrend(score, previousScore);

  // Base analysis
  const analysis: ScoreAnalysis = {
    score,
    comment: comment || undefined,
    sentiment: getSentimentFromScore(score),
    aspects: [],
    trend,
    deltaFromPrevious: delta,
  };

  // Extract aspects if comment exists
  if (comment && comment.trim()) {
    // Try LLM-based extraction first
    if (isLLMConfigured()) {
      const llmAspects = await extractAspectsWithLLM(comment, score);
      if (llmAspects.length > 0) {
        analysis.aspects = llmAspects;
        return analysis;
      }
    }

    // Fall back to keyword-based extraction
    analysis.aspects = extractAspectsFromKeywords(comment);
  }

  // If no aspects found but score is extreme, infer general aspect
  if (analysis.aspects.length === 0) {
    if (score <= 3) {
      analysis.aspects.push({
        aspect: 'quality',
        sentiment: 'negative',
        confidence: 0.5,
      });
    } else if (score >= 8) {
      analysis.aspects.push({
        aspect: 'quality',
        sentiment: 'positive',
        confidence: 0.5,
      });
    }
  }

  return analysis;
}

/**
 * Analyzes multiple rewards to find patterns
 */
export function analyzeRewardPatterns(
  analyses: ScoreAnalysis[]
): { commonAspects: string[]; overallTrend: Trend; avgScore: number } {
  if (analyses.length === 0) {
    return { commonAspects: [], overallTrend: 'stable', avgScore: 0 };
  }

  // Count aspect occurrences
  const aspectCounts = new Map<string, number>();
  for (const analysis of analyses) {
    for (const aspect of analysis.aspects) {
      aspectCounts.set(aspect.aspect, (aspectCounts.get(aspect.aspect) || 0) + 1);
    }
  }

  // Find common aspects (appear in >50% of analyses)
  const threshold = analyses.length / 2;
  const commonAspects = Array.from(aspectCounts.entries())
    .filter(([, count]) => count >= threshold)
    .map(([aspect]) => aspect);

  // Calculate overall trend
  const improving = analyses.filter((a) => a.trend === 'improving').length;
  const declining = analyses.filter((a) => a.trend === 'declining').length;

  let overallTrend: Trend = 'stable';
  if (improving > declining && improving > analyses.length / 3) {
    overallTrend = 'improving';
  } else if (declining > improving && declining > analyses.length / 3) {
    overallTrend = 'declining';
  }

  // Calculate average score
  const avgScore = analyses.reduce((sum, a) => sum + a.score, 0) / analyses.length;

  return { commonAspects, overallTrend, avgScore };
}

/**
 * Generates a natural language summary of the analysis
 */
export function summarizeAnalysis(analysis: ScoreAnalysis): string {
  const parts: string[] = [];

  // Score summary
  if (analysis.score >= 8) {
    parts.push(`Strong performance (${analysis.score}/10)`);
  } else if (analysis.score >= 5) {
    parts.push(`Moderate performance (${analysis.score}/10)`);
  } else {
    parts.push(`Needs improvement (${analysis.score}/10)`);
  }

  // Trend
  if (analysis.deltaFromPrevious !== 0) {
    const direction = analysis.deltaFromPrevious > 0 ? 'up' : 'down';
    parts.push(`${direction} ${Math.abs(analysis.deltaFromPrevious)} points`);
  }

  // Aspects
  if (analysis.aspects.length > 0) {
    const positiveAspects = analysis.aspects
      .filter((a) => a.sentiment === 'positive')
      .map((a) => a.aspect);
    const negativeAspects = analysis.aspects
      .filter((a) => a.sentiment === 'negative')
      .map((a) => a.aspect);

    if (positiveAspects.length > 0) {
      parts.push(`Positive: ${positiveAspects.join(', ')}`);
    }
    if (negativeAspects.length > 0) {
      parts.push(`Issues: ${negativeAspects.join(', ')}`);
    }
  }

  return parts.join('. ') + '.';
}
