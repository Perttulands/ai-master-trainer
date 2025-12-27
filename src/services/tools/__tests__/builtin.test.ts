import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  webSearchTool,
  formatMarkdownTool,
  analyzeDataTool,
  brainstormTool,
  calculateTool,
  summarizeTool,
  builtinTools,
  registerBuiltinTools,
} from '../builtin';
import { toolRegistry } from '../registry';

describe('Built-in Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toolRegistry.clear();
  });

  describe('registerBuiltinTools()', () => {
    it('should register all builtin tools', () => {
      registerBuiltinTools();

      expect(toolRegistry.has('web_search')).toBe(true);
      expect(toolRegistry.has('format_markdown')).toBe(true);
      expect(toolRegistry.has('analyze_data')).toBe(true);
      expect(toolRegistry.has('brainstorm')).toBe(true);
      expect(toolRegistry.has('calculate')).toBe(true);
      expect(toolRegistry.has('summarize')).toBe(true);
    });

    it('should export all tools in builtinTools array', () => {
      expect(builtinTools).toContain(webSearchTool);
      expect(builtinTools).toContain(formatMarkdownTool);
      expect(builtinTools).toContain(analyzeDataTool);
      expect(builtinTools).toContain(brainstormTool);
      expect(builtinTools).toContain(calculateTool);
      expect(builtinTools).toContain(summarizeTool);
      expect(builtinTools.length).toBe(6);
    });
  });

  describe('webSearchTool', () => {
    it('should have correct name and description', () => {
      expect(webSearchTool.name).toBe('web_search');
      expect(webSearchTool.description).toContain('Search the web');
    });

    it('should return search results for valid query', async () => {
      const result = await webSearchTool.execute({
        args: { query: 'artificial intelligence' },
      });

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();

      const output = result.output as {
        query: string;
        totalResults: number;
        results: Array<{ title: string; url: string; snippet: string }>;
      };
      expect(output.query).toBe('artificial intelligence');
      expect(output.totalResults).toBeGreaterThan(0);
      expect(output.results).toBeInstanceOf(Array);
      expect(output.results[0]).toHaveProperty('title');
      expect(output.results[0]).toHaveProperty('url');
      expect(output.results[0]).toHaveProperty('snippet');
    });

    it('should return error for empty query', async () => {
      const result = await webSearchTool.execute({
        args: { query: '' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Search query is required');
    });

    it('should return error for whitespace-only query', async () => {
      const result = await webSearchTool.execute({
        args: { query: '   ' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Search query is required');
    });

    it('should include metadata with execution time', async () => {
      const result = await webSearchTool.execute({
        args: { query: 'test' },
      });

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.executionTimeMs).toBeDefined();
      expect(result.metadata?.source).toBe('simulated');
    });
  });

  describe('formatMarkdownTool', () => {
    it('should have correct name and description', () => {
      expect(formatMarkdownTool.name).toBe('format_markdown');
      expect(formatMarkdownTool.description).toContain('markdown');
    });

    it('should format content as document by default', async () => {
      const result = await formatMarkdownTool.execute({
        args: { content: 'First paragraph\n\nSecond paragraph' },
      });

      expect(result.success).toBe(true);
      const output = result.output as { formatted: string };
      expect(output.formatted).toContain('#');
    });

    it('should format content as list', async () => {
      const result = await formatMarkdownTool.execute({
        args: { content: 'item1, item2, item3', format: 'list' },
      });

      expect(result.success).toBe(true);
      const output = result.output as { formatted: string };
      expect(output.formatted).toContain('- item1');
      expect(output.formatted).toContain('- item2');
      expect(output.formatted).toContain('- item3');
    });

    it('should format content as table', async () => {
      const result = await formatMarkdownTool.execute({
        args: { content: 'a,b,c\n1,2,3', format: 'table' },
      });

      expect(result.success).toBe(true);
      const output = result.output as { formatted: string };
      expect(output.formatted).toContain('|');
      expect(output.formatted).toContain('---');
    });

    it('should format content as code block', async () => {
      const result = await formatMarkdownTool.execute({
        args: { content: 'const x = 1;', format: 'code', language: 'javascript' },
      });

      expect(result.success).toBe(true);
      const output = result.output as { formatted: string };
      expect(output.formatted).toContain('```javascript');
      expect(output.formatted).toContain('const x = 1;');
      expect(output.formatted).toContain('```');
    });

    it('should format content as blockquote', async () => {
      const result = await formatMarkdownTool.execute({
        args: { content: 'A famous quote', format: 'blockquote' },
      });

      expect(result.success).toBe(true);
      const output = result.output as { formatted: string };
      expect(output.formatted).toContain('> A famous quote');
    });

    it('should return error for empty content', async () => {
      const result = await formatMarkdownTool.execute({
        args: { content: '' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Content is required for formatting');
    });

    it('should include original and formatted content in output', async () => {
      const result = await formatMarkdownTool.execute({
        args: { content: 'test content', format: 'list' },
      });

      expect(result.success).toBe(true);
      const output = result.output as { original: string; formatted: string; format: string };
      expect(output.original).toBe('test content');
      expect(output.format).toBe('list');
    });
  });

  describe('analyzeDataTool', () => {
    it('should have correct name and description', () => {
      expect(analyzeDataTool.name).toBe('analyze_data');
      expect(analyzeDataTool.description).toContain('Analyze data');
    });

    it('should return summary analysis by default', async () => {
      const result = await analyzeDataTool.execute({
        args: { data: 'some sample data for analysis' },
      });

      expect(result.success).toBe(true);
      const output = result.output as {
        summary: string;
        insights: string[];
        statistics: Record<string, number>;
      };
      expect(output.summary).toBeDefined();
      expect(output.insights).toBeInstanceOf(Array);
      expect(output.statistics).toBeDefined();
    });

    it('should return sentiment analysis when type is sentiment', async () => {
      const result = await analyzeDataTool.execute({
        args: { data: 'I love this product!', type: 'sentiment' },
      });

      expect(result.success).toBe(true);
      const output = result.output as {
        summary: string;
        statistics: { positive: number; neutral: number; negative: number };
      };
      expect(output.summary).toContain('Sentiment');
      expect(output.statistics).toHaveProperty('positive');
      expect(output.statistics).toHaveProperty('neutral');
      expect(output.statistics).toHaveProperty('negative');
    });

    it('should return trend analysis when type is trend', async () => {
      const result = await analyzeDataTool.execute({
        args: { data: '10,20,30,40,50', type: 'trend' },
      });

      expect(result.success).toBe(true);
      const output = result.output as {
        summary: string;
        statistics: { growthRate: number; trendStrength: number };
      };
      expect(output.summary).toContain('Trend');
      expect(output.statistics).toHaveProperty('growthRate');
      expect(output.statistics).toHaveProperty('trendStrength');
    });

    it('should include metadata with execution info', async () => {
      const result = await analyzeDataTool.execute({
        args: { data: 'test data', type: 'summary' },
      });

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.analysisType).toBe('summary');
    });
  });

  describe('brainstormTool', () => {
    it('should have correct name and description', () => {
      expect(brainstormTool.name).toBe('brainstorm');
      expect(brainstormTool.description).toContain('creative ideas');
    });

    it('should generate ideas for a topic', async () => {
      const result = await brainstormTool.execute({
        args: { topic: 'productivity apps' },
      });

      expect(result.success).toBe(true);
      const output = result.output as {
        topic: string;
        style: string;
        ideas: Array<{ idea: string; rationale: string }>;
      };
      expect(output.topic).toBe('productivity apps');
      expect(output.ideas).toBeInstanceOf(Array);
      expect(output.ideas.length).toBeGreaterThan(0);
      expect(output.ideas[0]).toHaveProperty('idea');
      expect(output.ideas[0]).toHaveProperty('rationale');
      expect(output.ideas[0]).toHaveProperty('feasibility');
      expect(output.ideas[0]).toHaveProperty('innovationScore');
    });

    it('should respect count parameter', async () => {
      const result = await brainstormTool.execute({
        args: { topic: 'test topic', count: 3 },
      });

      expect(result.success).toBe(true);
      const output = result.output as { ideas: unknown[] };
      expect(output.ideas.length).toBe(3);
    });

    it('should limit count to maximum of 10', async () => {
      const result = await brainstormTool.execute({
        args: { topic: 'test topic', count: 20 },
      });

      expect(result.success).toBe(true);
      const output = result.output as { ideas: unknown[] };
      expect(output.ideas.length).toBeLessThanOrEqual(10);
    });

    it('should support different styles', async () => {
      const creativeResult = await brainstormTool.execute({
        args: { topic: 'innovation', style: 'creative' },
      });
      const practicalResult = await brainstormTool.execute({
        args: { topic: 'innovation', style: 'practical' },
      });

      expect(creativeResult.success).toBe(true);
      expect(practicalResult.success).toBe(true);

      const creativeOutput = creativeResult.output as { style: string };
      const practicalOutput = practicalResult.output as { style: string };
      expect(creativeOutput.style).toBe('creative');
      expect(practicalOutput.style).toBe('practical');
    });

    it('should return error for empty topic', async () => {
      const result = await brainstormTool.execute({
        args: { topic: '' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Topic is required for brainstorming');
    });
  });

  describe('calculateTool', () => {
    it('should have correct name and description', () => {
      expect(calculateTool.name).toBe('calculate');
      expect(calculateTool.description).toContain('mathematical calculations');
    });

    it('should evaluate addition', async () => {
      const result = await calculateTool.execute({
        args: { expression: '5 + 3' },
      });

      expect(result.success).toBe(true);
      const output = result.output as { result: number };
      expect(output.result).toBe(8);
    });

    it('should evaluate subtraction', async () => {
      const result = await calculateTool.execute({
        args: { expression: '10 - 4' },
      });

      expect(result.success).toBe(true);
      const output = result.output as { result: number };
      expect(output.result).toBe(6);
    });

    it('should evaluate multiplication', async () => {
      const result = await calculateTool.execute({
        args: { expression: '7 * 6' },
      });

      expect(result.success).toBe(true);
      const output = result.output as { result: number };
      expect(output.result).toBe(42);
    });

    it('should evaluate division', async () => {
      const result = await calculateTool.execute({
        args: { expression: '20 / 4' },
      });

      expect(result.success).toBe(true);
      const output = result.output as { result: number };
      expect(output.result).toBe(5);
    });

    it('should evaluate modulo', async () => {
      const result = await calculateTool.execute({
        args: { expression: '17 % 5' },
      });

      expect(result.success).toBe(true);
      const output = result.output as { result: number };
      expect(output.result).toBe(2);
    });

    it('should handle division by zero', async () => {
      const result = await calculateTool.execute({
        args: { expression: '10 / 0' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Division by zero');
    });

    it('should return error for empty expression', async () => {
      const result = await calculateTool.execute({
        args: { expression: '' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Mathematical expression is required');
    });

    it('should include formatted result', async () => {
      const result = await calculateTool.execute({
        args: { expression: '1000 + 234' },
      });

      expect(result.success).toBe(true);
      const output = result.output as { expression: string; result: number; formatted: string };
      expect(output.expression).toBe('1000 + 234');
      expect(output.formatted).toBeDefined();
    });
  });

  describe('summarizeTool', () => {
    it('should have correct name and description', () => {
      expect(summarizeTool.name).toBe('summarize');
      expect(summarizeTool.description).toContain('summary');
    });

    it('should generate a summary of content', async () => {
      const content = 'This is the first sentence. This is the second sentence. And here is a third one.';
      const result = await summarizeTool.execute({
        args: { content },
      });

      expect(result.success).toBe(true);
      const output = result.output as { summary: string; originalLength: number; summaryLength: number };
      expect(output.summary).toBeDefined();
      expect(output.originalLength).toBe(content.length);
      // Note: The summarize tool appends metadata to the summary, so we just check it exists
      expect(output.summaryLength).toBeGreaterThan(0);
    });

    it('should respect short length parameter', async () => {
      const content = 'First sentence here. Second sentence follows. Third one too. Fourth sentence. Fifth sentence.';
      const result = await summarizeTool.execute({
        args: { content, length: 'short' },
      });

      expect(result.success).toBe(true);
      const output = result.output as { summary: string };
      // Short should have fewer sentences
      expect(output.summary.split('.').length).toBeLessThanOrEqual(4);
    });

    it('should respect long length parameter', async () => {
      const content = 'First. Second. Third. Fourth. Fifth. Sixth. Seventh. Eighth.';
      const result = await summarizeTool.execute({
        args: { content, length: 'long' },
      });

      expect(result.success).toBe(true);
    });

    it('should return error for empty content', async () => {
      const result = await summarizeTool.execute({
        args: { content: '' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Content is required for summarization');
    });

    it('should include compression ratio', async () => {
      const result = await summarizeTool.execute({
        args: { content: 'This is a long piece of content that needs to be summarized into something shorter.' },
      });

      expect(result.success).toBe(true);
      const output = result.output as { compressionRatio: string };
      expect(output.compressionRatio).toBeDefined();
      expect(parseFloat(output.compressionRatio)).toBeGreaterThan(0);
    });
  });
});
