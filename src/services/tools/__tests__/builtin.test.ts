import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  knowledgeQueryTool,
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

// Mock the LLM module
vi.mock('../../../api/llm', () => ({
  generateWithSystem: vi.fn(),
  isLLMConfigured: vi.fn(() => true),
}));

import { generateWithSystem, isLLMConfigured } from '../../../api/llm';

describe('Built-in Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toolRegistry.clear();
    (isLLMConfigured as Mock).mockReturnValue(true);
  });

  describe('registerBuiltinTools()', () => {
    it('should register all builtin tools', () => {
      registerBuiltinTools();

      expect(toolRegistry.has('knowledge_query')).toBe(true);
      expect(toolRegistry.has('web_search')).toBe(true);
      expect(toolRegistry.has('format_markdown')).toBe(true);
      expect(toolRegistry.has('analyze_data')).toBe(true);
      expect(toolRegistry.has('brainstorm')).toBe(true);
      expect(toolRegistry.has('calculate')).toBe(true);
      expect(toolRegistry.has('summarize')).toBe(true);
    });

    it('should export all tools in builtinTools array', () => {
      expect(builtinTools).toContain(knowledgeQueryTool);
      expect(builtinTools).toContain(webSearchTool);
      expect(builtinTools).toContain(formatMarkdownTool);
      expect(builtinTools).toContain(analyzeDataTool);
      expect(builtinTools).toContain(brainstormTool);
      expect(builtinTools).toContain(calculateTool);
      expect(builtinTools).toContain(summarizeTool);
      expect(builtinTools.length).toBe(7); // Now includes knowledge_query
    });
  });

  describe('knowledgeQueryTool', () => {
    it('should have correct name and description', () => {
      expect(knowledgeQueryTool.name).toBe('knowledge_query');
      expect(knowledgeQueryTool.description).toContain('knowledge');
    });

    it('should return knowledge results for valid query', async () => {
      const mockResponse = JSON.stringify({
        query: 'artificial intelligence',
        summary: 'AI is a field of computer science.',
        details: ['Detail 1', 'Detail 2'],
        relatedTopics: ['Machine Learning'],
        confidence: 'high',
        caveat: null,
      });
      (generateWithSystem as Mock).mockResolvedValue(mockResponse);

      const result = await knowledgeQueryTool.execute({
        args: { query: 'artificial intelligence' },
      });

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
      expect((result.output as { query: string }).query).toBe('artificial intelligence');
      expect(result.metadata?.source).toBe('llm-knowledge');
    });

    it('should return error for empty query', async () => {
      const result = await knowledgeQueryTool.execute({
        args: { query: '' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Query is required');
    });

    it('should return error when LLM not configured', async () => {
      (isLLMConfigured as Mock).mockReturnValue(false);

      const result = await knowledgeQueryTool.execute({
        args: { query: 'test' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('LLM not configured');
    });
  });

  describe('webSearchTool (alias for knowledge_query)', () => {
    it('should have correct name and description', () => {
      expect(webSearchTool.name).toBe('web_search');
      expect(webSearchTool.description).toContain('Search');
    });

    it('should delegate to knowledge_query and add note', async () => {
      const mockResponse = JSON.stringify({
        query: 'test',
        summary: 'Test summary',
        details: [],
        relatedTopics: [],
        confidence: 'medium',
        caveat: null,
      });
      (generateWithSystem as Mock).mockResolvedValue(mockResponse);

      const result = await webSearchTool.execute({
        args: { query: 'test' },
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.note).toContain('AI knowledge');
    });
  });

  describe('formatMarkdownTool', () => {
    it('should have correct name and description', () => {
      expect(formatMarkdownTool.name).toBe('format_markdown');
      expect(formatMarkdownTool.description).toContain('markdown');
    });

    it('should format content as list (deterministic)', async () => {
      const result = await formatMarkdownTool.execute({
        args: { content: 'item1, item2, item3', format: 'list' },
      });

      expect(result.success).toBe(true);
      const output = result.output as { formatted: string };
      expect(output.formatted).toContain('- item1');
      expect(output.formatted).toContain('- item2');
      expect(output.formatted).toContain('- item3');
    });

    it('should format content as table (deterministic)', async () => {
      const result = await formatMarkdownTool.execute({
        args: { content: 'a,b,c\n1,2,3', format: 'table' },
      });

      expect(result.success).toBe(true);
      const output = result.output as { formatted: string };
      expect(output.formatted).toContain('|');
      expect(output.formatted).toContain('---');
    });

    it('should format content as code block (deterministic)', async () => {
      const result = await formatMarkdownTool.execute({
        args: { content: 'const x = 1;', format: 'code', language: 'javascript' },
      });

      expect(result.success).toBe(true);
      const output = result.output as { formatted: string };
      expect(output.formatted).toContain('```javascript');
      expect(output.formatted).toContain('const x = 1;');
      expect(output.formatted).toContain('```');
    });

    it('should format content as blockquote (deterministic)', async () => {
      const result = await formatMarkdownTool.execute({
        args: { content: 'A famous quote', format: 'blockquote' },
      });

      expect(result.success).toBe(true);
      const output = result.output as { formatted: string };
      expect(output.formatted).toContain('> A famous quote');
    });

    it('should use LLM for document format when configured', async () => {
      (generateWithSystem as Mock).mockResolvedValue('# Formatted\n\nContent here');

      const result = await formatMarkdownTool.execute({
        args: { content: 'Some content to format', format: 'document' },
      });

      expect(result.success).toBe(true);
      expect(generateWithSystem).toHaveBeenCalled();
      expect(result.metadata?.source).toBe('llm');
    });

    it('should return error for empty content', async () => {
      const result = await formatMarkdownTool.execute({
        args: { content: '' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Content is required for formatting');
    });
  });

  describe('analyzeDataTool', () => {
    it('should have correct name and description', () => {
      expect(analyzeDataTool.name).toBe('analyze_data');
      expect(analyzeDataTool.description).toContain('Analyze data');
    });

    it('should return analysis from LLM', async () => {
      const mockResponse = JSON.stringify({
        summary: 'Data analysis complete.',
        insights: ['Insight 1', 'Insight 2'],
        statistics: { count: 10, avg: 5.5 },
        recommendations: ['Recommendation 1'],
      });
      (generateWithSystem as Mock).mockResolvedValue(mockResponse);

      const result = await analyzeDataTool.execute({
        args: { data: 'some sample data for analysis' },
      });

      expect(result.success).toBe(true);
      const output = result.output as { summary: string; insights: string[] };
      expect(output.summary).toBeDefined();
      expect(output.insights).toBeInstanceOf(Array);
      expect(result.metadata?.source).toBe('llm');
    });

    it('should return error when LLM not configured', async () => {
      (isLLMConfigured as Mock).mockReturnValue(false);

      const result = await analyzeDataTool.execute({
        args: { data: 'test data' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('LLM not configured');
    });

    it('should include analysis type in metadata', async () => {
      const mockResponse = JSON.stringify({
        summary: 'Sentiment analysis',
        insights: [],
        statistics: { positive: 0.8, neutral: 0.15, negative: 0.05 },
        recommendations: [],
      });
      (generateWithSystem as Mock).mockResolvedValue(mockResponse);

      const result = await analyzeDataTool.execute({
        args: { data: 'I love this product!', type: 'sentiment' },
      });

      expect(result.metadata?.analysisType).toBe('sentiment');
    });
  });

  describe('brainstormTool', () => {
    it('should have correct name and description', () => {
      expect(brainstormTool.name).toBe('brainstorm');
      expect(brainstormTool.description).toContain('creative ideas');
    });

    it('should generate ideas from LLM', async () => {
      const mockIdeas = [
        { idea: 'Idea 1', rationale: 'Reason 1', feasibility: 'high', innovationScore: 0.9 },
        { idea: 'Idea 2', rationale: 'Reason 2', feasibility: 'medium', innovationScore: 0.7 },
      ];
      (generateWithSystem as Mock).mockResolvedValue(JSON.stringify(mockIdeas));

      const result = await brainstormTool.execute({
        args: { topic: 'productivity apps' },
      });

      expect(result.success).toBe(true);
      const output = result.output as { topic: string; ideas: typeof mockIdeas };
      expect(output.topic).toBe('productivity apps');
      expect(output.ideas).toBeInstanceOf(Array);
      expect(output.ideas.length).toBe(2);
      expect(output.ideas[0]).toHaveProperty('idea');
      expect(output.ideas[0]).toHaveProperty('rationale');
      expect(result.metadata?.source).toBe('llm');
    });

    it('should return error for empty topic', async () => {
      const result = await brainstormTool.execute({
        args: { topic: '' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Topic is required for brainstorming');
    });

    it('should return error when LLM not configured', async () => {
      (isLLMConfigured as Mock).mockReturnValue(false);

      const result = await brainstormTool.execute({
        args: { topic: 'test' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('LLM not configured');
    });
  });

  describe('calculateTool (deterministic - no LLM)', () => {
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

    it('should NOT call LLM', async () => {
      await calculateTool.execute({
        args: { expression: '1 + 1' },
      });

      expect(generateWithSystem).not.toHaveBeenCalled();
    });
  });

  describe('summarizeTool', () => {
    it('should have correct name and description', () => {
      expect(summarizeTool.name).toBe('summarize');
      expect(summarizeTool.description).toContain('summary');
    });

    it('should generate summary from LLM', async () => {
      (generateWithSystem as Mock).mockResolvedValue('This is a concise summary of the content.');

      const content = 'This is the first sentence. This is the second sentence. And here is a third one.';
      const result = await summarizeTool.execute({
        args: { content },
      });

      expect(result.success).toBe(true);
      const output = result.output as { summary: string; originalLength: number; summaryLength: number };
      expect(output.summary).toBe('This is a concise summary of the content.');
      expect(output.originalLength).toBe(content.length);
      expect(result.metadata?.source).toBe('llm');
    });

    it('should return error for empty content', async () => {
      const result = await summarizeTool.execute({
        args: { content: '' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Content is required for summarization');
    });

    it('should return error when LLM not configured', async () => {
      (isLLMConfigured as Mock).mockReturnValue(false);

      const result = await summarizeTool.execute({
        args: { content: 'test content' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('LLM not configured');
    });

    it('should include compression ratio', async () => {
      const longContent = 'This is a long piece of content that needs to be summarized into something shorter.';
      (generateWithSystem as Mock).mockResolvedValue('Short summary.');

      const result = await summarizeTool.execute({
        args: { content: longContent },
      });

      expect(result.success).toBe(true);
      const output = result.output as { compressionRatio: string };
      expect(output.compressionRatio).toBeDefined();
      expect(parseFloat(output.compressionRatio)).toBeGreaterThan(0);
    });
  });
});
