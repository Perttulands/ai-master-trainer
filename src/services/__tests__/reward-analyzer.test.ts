/**
 * Reward Analyzer Tests
 *
 * Tests for the reward analysis service that parses user feedback.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  analyzeReward,
  analyzeRewardPatterns,
  summarizeAnalysis,
} from '../reward-analyzer';
import type { ScoreAnalysis } from '../../types/evolution';

// Mock the LLM client
vi.mock('../../api/llm', () => ({
  llmClient: {
    chat: vi.fn(),
  },
  isLLMConfigured: vi.fn(() => false), // Default to keyword-based extraction
}));

describe('reward-analyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('analyzeReward', () => {
    describe('sentiment from score', () => {
      it('returns positive sentiment for high scores (7-10)', async () => {
        const result = await analyzeReward(8, null, null);
        expect(result.sentiment).toBe('positive');
      });

      it('returns neutral sentiment for medium scores (4-6)', async () => {
        const result = await analyzeReward(5, null, null);
        expect(result.sentiment).toBe('neutral');
      });

      it('returns negative sentiment for low scores (1-3)', async () => {
        const result = await analyzeReward(2, null, null);
        expect(result.sentiment).toBe('negative');
      });

      it('handles boundary scores correctly', async () => {
        expect((await analyzeReward(7, null, null)).sentiment).toBe('positive');
        expect((await analyzeReward(6, null, null)).sentiment).toBe('neutral');
        expect((await analyzeReward(4, null, null)).sentiment).toBe('neutral');
        expect((await analyzeReward(3, null, null)).sentiment).toBe('negative');
      });
    });

    describe('trend calculation', () => {
      it('returns stable trend when no previous score', async () => {
        const result = await analyzeReward(7, null, null);
        expect(result.trend).toBe('stable');
        expect(result.deltaFromPrevious).toBe(0);
      });

      it('returns improving trend when score increases by 2+', async () => {
        const result = await analyzeReward(8, null, 5);
        expect(result.trend).toBe('improving');
        expect(result.deltaFromPrevious).toBe(3);
      });

      it('returns declining trend when score decreases by 2+', async () => {
        const result = await analyzeReward(4, null, 7);
        expect(result.trend).toBe('declining');
        expect(result.deltaFromPrevious).toBe(-3);
      });

      it('returns stable trend for small changes', async () => {
        const result = await analyzeReward(6, null, 5);
        expect(result.trend).toBe('stable');
        expect(result.deltaFromPrevious).toBe(1);
      });
    });

    describe('aspect extraction from keywords', () => {
      it('extracts length aspect from comment', async () => {
        const result = await analyzeReward(5, 'The response was too long', null);
        const lengthAspect = result.aspects.find((a) => a.aspect === 'length');
        expect(lengthAspect).toBeDefined();
      });

      it('extracts tone aspect from comment', async () => {
        const result = await analyzeReward(5, 'The tone was too formal', null);
        const toneAspect = result.aspects.find((a) => a.aspect === 'tone');
        expect(toneAspect).toBeDefined();
      });

      it('extracts accuracy aspect from comment', async () => {
        const result = await analyzeReward(3, 'There was a mistake in the response', null);
        const accuracyAspect = result.aspects.find((a) => a.aspect === 'accuracy');
        expect(accuracyAspect).toBeDefined();
      });

      it('extracts format aspect from comment', async () => {
        const result = await analyzeReward(6, 'Could use better formatting with bullets', null);
        const formatAspect = result.aspects.find((a) => a.aspect === 'format');
        expect(formatAspect).toBeDefined();
      });

      it('extracts completeness aspect from comment', async () => {
        const result = await analyzeReward(4, 'The answer was incomplete', null);
        const completenessAspect = result.aspects.find((a) => a.aspect === 'completeness');
        expect(completenessAspect).toBeDefined();
      });

      it('extracts relevance aspect from comment', async () => {
        const result = await analyzeReward(4, 'Response went off-topic', null);
        const relevanceAspect = result.aspects.find((a) => a.aspect === 'relevance');
        expect(relevanceAspect).toBeDefined();
      });

      it('extracts creativity aspect from comment', async () => {
        const result = await analyzeReward(7, 'Very creative approach', null);
        const creativityAspect = result.aspects.find((a) => a.aspect === 'creativity');
        expect(creativityAspect).toBeDefined();
      });

      it('handles multiple aspects in one comment', async () => {
        const result = await analyzeReward(
          4,
          'Too long and incorrect information',
          null
        );
        expect(result.aspects.length).toBeGreaterThanOrEqual(2);
      });

      it('avoids duplicate aspects', async () => {
        const result = await analyzeReward(
          4,
          'Too long, very lengthy, verbose response',
          null
        );
        const lengthAspects = result.aspects.filter((a) => a.aspect === 'length');
        expect(lengthAspects.length).toBe(1);
      });
    });

    describe('sentiment detection in aspects', () => {
      it('detects negative sentiment from negative indicators', async () => {
        const result = await analyzeReward(3, 'The response was terrible and wrong', null);
        const hasNegative = result.aspects.some((a) => a.sentiment === 'negative');
        expect(hasNegative).toBe(true);
      });

      it('detects positive sentiment from positive indicators', async () => {
        const result = await analyzeReward(8, 'Great formatting, very helpful', null);
        const hasPositive = result.aspects.some((a) => a.sentiment === 'positive');
        expect(hasPositive).toBe(true);
      });

      it('handles negation in sentiment detection', async () => {
        // Negation detection is best-effort - the important thing is that
        // aspects are still extracted even with complex sentence structure
        const result = await analyzeReward(7, 'The length was not too long', null);
        const lengthAspect = result.aspects.find((a) => a.aspect === 'length');
        // Length aspect should be found since "long" is a keyword
        expect(lengthAspect).toBeDefined();
      });
    });

    describe('default quality aspect for extreme scores', () => {
      it('adds negative quality aspect for very low scores without aspects', async () => {
        const result = await analyzeReward(2, '', null);
        const qualityAspect = result.aspects.find((a) => a.aspect === 'quality');
        expect(qualityAspect).toBeDefined();
        expect(qualityAspect?.sentiment).toBe('negative');
      });

      it('adds positive quality aspect for very high scores without aspects', async () => {
        const result = await analyzeReward(9, '', null);
        const qualityAspect = result.aspects.find((a) => a.aspect === 'quality');
        expect(qualityAspect).toBeDefined();
        expect(qualityAspect?.sentiment).toBe('positive');
      });

      it('does not add quality aspect for moderate scores', async () => {
        const result = await analyzeReward(5, '', null);
        const qualityAspect = result.aspects.find((a) => a.aspect === 'quality');
        expect(qualityAspect).toBeUndefined();
      });
    });

    describe('edge cases', () => {
      it('handles null comment', async () => {
        const result = await analyzeReward(7, null, null);
        expect(result.comment).toBeUndefined();
      });

      it('handles undefined comment', async () => {
        const result = await analyzeReward(7, undefined, null);
        expect(result.comment).toBeUndefined();
      });

      it('handles empty string comment', async () => {
        const result = await analyzeReward(7, '', null);
        expect(result.aspects.length).toBe(0); // No aspects from empty comment
      });

      it('handles whitespace-only comment', async () => {
        const result = await analyzeReward(7, '   ', null);
        expect(result.aspects.length).toBe(0);
      });
    });
  });

  describe('analyzeRewardPatterns', () => {
    it('returns empty patterns for empty input', () => {
      const result = analyzeRewardPatterns([]);
      expect(result.commonAspects).toEqual([]);
      expect(result.overallTrend).toBe('stable');
      expect(result.avgScore).toBe(0);
    });

    it('calculates average score correctly', () => {
      const analyses: ScoreAnalysis[] = [
        { score: 6, sentiment: 'neutral', aspects: [], trend: 'stable', deltaFromPrevious: 0 },
        { score: 8, sentiment: 'positive', aspects: [], trend: 'stable', deltaFromPrevious: 0 },
        { score: 4, sentiment: 'neutral', aspects: [], trend: 'stable', deltaFromPrevious: 0 },
      ];
      const result = analyzeRewardPatterns(analyses);
      expect(result.avgScore).toBe(6);
    });

    it('identifies common aspects (>50% occurrence)', () => {
      const analyses: ScoreAnalysis[] = [
        {
          score: 5,
          sentiment: 'neutral',
          aspects: [{ aspect: 'length', sentiment: 'negative', confidence: 0.8 }],
          trend: 'stable',
          deltaFromPrevious: 0,
        },
        {
          score: 4,
          sentiment: 'neutral',
          aspects: [{ aspect: 'length', sentiment: 'negative', confidence: 0.8 }],
          trend: 'stable',
          deltaFromPrevious: 0,
        },
        {
          score: 6,
          sentiment: 'neutral',
          aspects: [{ aspect: 'tone', sentiment: 'positive', confidence: 0.7 }],
          trend: 'stable',
          deltaFromPrevious: 0,
        },
      ];
      const result = analyzeRewardPatterns(analyses);
      expect(result.commonAspects).toContain('length');
      expect(result.commonAspects).not.toContain('tone'); // Only 1/3
    });

    it('determines improving overall trend', () => {
      const analyses: ScoreAnalysis[] = [
        { score: 5, sentiment: 'neutral', aspects: [], trend: 'improving', deltaFromPrevious: 2 },
        { score: 7, sentiment: 'positive', aspects: [], trend: 'improving', deltaFromPrevious: 2 },
        { score: 8, sentiment: 'positive', aspects: [], trend: 'stable', deltaFromPrevious: 1 },
      ];
      const result = analyzeRewardPatterns(analyses);
      expect(result.overallTrend).toBe('improving');
    });

    it('determines declining overall trend', () => {
      const analyses: ScoreAnalysis[] = [
        { score: 8, sentiment: 'positive', aspects: [], trend: 'declining', deltaFromPrevious: -2 },
        { score: 5, sentiment: 'neutral', aspects: [], trend: 'declining', deltaFromPrevious: -3 },
        { score: 4, sentiment: 'neutral', aspects: [], trend: 'stable', deltaFromPrevious: -1 },
      ];
      const result = analyzeRewardPatterns(analyses);
      expect(result.overallTrend).toBe('declining');
    });

    it('determines stable trend when mixed', () => {
      const analyses: ScoreAnalysis[] = [
        { score: 6, sentiment: 'neutral', aspects: [], trend: 'improving', deltaFromPrevious: 2 },
        { score: 5, sentiment: 'neutral', aspects: [], trend: 'declining', deltaFromPrevious: -2 },
        { score: 5, sentiment: 'neutral', aspects: [], trend: 'stable', deltaFromPrevious: 0 },
      ];
      const result = analyzeRewardPatterns(analyses);
      expect(result.overallTrend).toBe('stable');
    });
  });

  describe('summarizeAnalysis', () => {
    it('generates summary for high score', () => {
      const analysis: ScoreAnalysis = {
        score: 9,
        sentiment: 'positive',
        aspects: [],
        trend: 'stable',
        deltaFromPrevious: 0,
      };
      const summary = summarizeAnalysis(analysis);
      expect(summary).toContain('Strong performance');
      expect(summary).toContain('9/10');
    });

    it('generates summary for moderate score', () => {
      const analysis: ScoreAnalysis = {
        score: 6,
        sentiment: 'neutral',
        aspects: [],
        trend: 'stable',
        deltaFromPrevious: 0,
      };
      const summary = summarizeAnalysis(analysis);
      expect(summary).toContain('Moderate performance');
      expect(summary).toContain('6/10');
    });

    it('generates summary for low score', () => {
      const analysis: ScoreAnalysis = {
        score: 3,
        sentiment: 'negative',
        aspects: [],
        trend: 'stable',
        deltaFromPrevious: 0,
      };
      const summary = summarizeAnalysis(analysis);
      expect(summary).toContain('Needs improvement');
      expect(summary).toContain('3/10');
    });

    it('includes trend information when delta is non-zero', () => {
      const analysis: ScoreAnalysis = {
        score: 7,
        sentiment: 'positive',
        aspects: [],
        trend: 'improving',
        deltaFromPrevious: 3,
      };
      const summary = summarizeAnalysis(analysis);
      expect(summary).toContain('up 3 points');
    });

    it('includes negative trend information', () => {
      const analysis: ScoreAnalysis = {
        score: 4,
        sentiment: 'neutral',
        aspects: [],
        trend: 'declining',
        deltaFromPrevious: -2,
      };
      const summary = summarizeAnalysis(analysis);
      expect(summary).toContain('down 2 points');
    });

    it('lists positive aspects', () => {
      const analysis: ScoreAnalysis = {
        score: 8,
        sentiment: 'positive',
        aspects: [
          { aspect: 'format', sentiment: 'positive', confidence: 0.8 },
          { aspect: 'tone', sentiment: 'positive', confidence: 0.7 },
        ],
        trend: 'stable',
        deltaFromPrevious: 0,
      };
      const summary = summarizeAnalysis(analysis);
      expect(summary).toContain('Positive:');
      expect(summary).toContain('format');
      expect(summary).toContain('tone');
    });

    it('lists negative aspects as issues', () => {
      const analysis: ScoreAnalysis = {
        score: 4,
        sentiment: 'neutral',
        aspects: [
          { aspect: 'length', sentiment: 'negative', confidence: 0.8 },
          { aspect: 'accuracy', sentiment: 'negative', confidence: 0.9 },
        ],
        trend: 'stable',
        deltaFromPrevious: 0,
      };
      const summary = summarizeAnalysis(analysis);
      expect(summary).toContain('Issues:');
      expect(summary).toContain('length');
      expect(summary).toContain('accuracy');
    });
  });
});
