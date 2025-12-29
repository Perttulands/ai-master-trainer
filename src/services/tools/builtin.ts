/**
 * Built-in Tool Implementations
 *
 * LLM-powered tools that produce real results.
 * All tools (except calculate) require LLM to be configured.
 *
 * Tools:
 * - knowledge_query: Query LLM's training knowledge (replaces web_search)
 * - brainstorm: LLM-powered creative idea generation
 * - analyze_data: LLM-powered data analysis
 * - summarize: LLM-powered text summarization
 * - format_markdown: Hybrid - simple formats are deterministic, complex use LLM
 * - calculate: Deterministic math parser (no LLM needed)
 */

import { toolRegistry, type ToolImplementation, type ToolResult, type ToolExecutionParams } from './registry';
import { generateWithSystem, isLLMConfigured } from '../../api/llm';

// ============================================================================
// Knowledge Query Tool (replaces web_search)
// ============================================================================

/**
 * Knowledge query tool - queries LLM's training knowledge
 * Since we don't have external search APIs, this uses the LLM's knowledge base
 */
const knowledgeQueryTool: ToolImplementation = {
  name: 'knowledge_query',
  description: 'Query knowledge base for information on a topic (uses AI knowledge)',

  async execute(params: ToolExecutionParams): Promise<ToolResult> {
    const { args } = params;
    const query = (args.query as string) || (args.input as string) || '';

    if (!query.trim()) {
      return {
        success: false,
        output: null,
        error: 'Query is required',
      };
    }

    if (!isLLMConfigured()) {
      return {
        success: false,
        output: null,
        error: 'LLM not configured. Set VITE_LITELLM_API_BASE and VITE_LITELLM_API_KEY.',
      };
    }

    const startTime = Date.now();

    const systemPrompt = `You are a knowledge assistant. Answer the query using your training knowledge.

Important:
- Provide factual, well-organized information
- Acknowledge if information might be outdated
- Structure response with key points
- Be honest about uncertainty

Return a JSON object with these exact fields:
{
  "query": "the original query",
  "summary": "A concise answer (2-3 sentences)",
  "details": ["Detailed point 1", "Detailed point 2", ...],
  "relatedTopics": ["related topic 1", "related topic 2"],
  "confidence": "high" | "medium" | "low",
  "caveat": "any important caveats about the information, or null if none"
}

Return ONLY valid JSON, no markdown code blocks or explanation.`;

    try {
      const response = await generateWithSystem(systemPrompt, query, {
        temperature: 0.3,
        maxTokens: 1024,
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Invalid response format from LLM');
      }

      const result = JSON.parse(jsonMatch[0]);

      return {
        success: true,
        output: result,
        metadata: {
          executionTimeMs: Date.now() - startTime,
          source: 'llm-knowledge',
        },
      };
    } catch (error) {
      return {
        success: false,
        output: null,
        error: error instanceof Error ? error.message : 'Knowledge query failed',
        metadata: { executionTimeMs: Date.now() - startTime },
      };
    }
  },
};

/**
 * Web search tool - now an alias for knowledge_query
 * Kept for backwards compatibility with existing flows
 */
const webSearchTool: ToolImplementation = {
  name: 'web_search',
  description: 'Search for information (uses AI knowledge, not live web search)',

  async execute(params: ToolExecutionParams): Promise<ToolResult> {
    // Delegate to knowledge_query
    const result = await knowledgeQueryTool.execute(params);

    // Add note about what this tool actually does
    if (result.metadata) {
      result.metadata.note = 'web_search uses AI knowledge. For live web data, external APIs are required.';
    }

    return result;
  },
};

// ============================================================================
// Brainstorm Tool (LLM-powered)
// ============================================================================

const brainstormTool: ToolImplementation = {
  name: 'brainstorm',
  description: 'Generate creative ideas and suggestions for a given topic or problem',

  async execute(params: ToolExecutionParams): Promise<ToolResult> {
    const { args } = params;
    const topic = (args.topic as string) || (args.input as string) || '';
    const count = Math.min((args.count as number) || 5, 10);
    const style = (args.style as string) || 'creative';

    if (!topic.trim()) {
      return {
        success: false,
        output: null,
        error: 'Topic is required for brainstorming',
      };
    }

    if (!isLLMConfigured()) {
      return {
        success: false,
        output: null,
        error: 'LLM not configured. Set VITE_LITELLM_API_BASE and VITE_LITELLM_API_KEY.',
      };
    }

    const startTime = Date.now();

    const systemPrompt = `You are a creative brainstorming assistant. Generate ${count} unique, actionable ideas.

For each idea, provide:
1. A clear, specific idea title
2. A brief rationale (1-2 sentences)
3. Feasibility assessment: "high", "medium", or "low"
4. Innovation score: a number between 0.5 and 1.0

Style to apply: ${style}
- creative: Bold, unconventional approaches
- practical: Feasible, implementable solutions
- innovative: Cutting-edge, technology-forward ideas

Return ONLY a valid JSON array in this exact format (no markdown):
[{"idea": "...", "rationale": "...", "feasibility": "high", "innovationScore": 0.8}]`;

    const userPrompt = `Generate ${count} ${style} ideas for: ${topic}`;

    try {
      const response = await generateWithSystem(systemPrompt, userPrompt, {
        temperature: 0.8,
        maxTokens: 1024,
      });

      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('Invalid response format from LLM');
      }

      const ideas = JSON.parse(jsonMatch[0]);

      return {
        success: true,
        output: {
          topic,
          style,
          ideas,
          metadata: {
            generatedCount: ideas.length,
            approachUsed: style,
          },
        },
        metadata: {
          executionTimeMs: Date.now() - startTime,
          source: 'llm',
        },
      };
    } catch (error) {
      return {
        success: false,
        output: null,
        error: error instanceof Error ? error.message : 'Brainstorming failed',
        metadata: { executionTimeMs: Date.now() - startTime },
      };
    }
  },
};

// ============================================================================
// Analyze Data Tool (LLM-powered)
// ============================================================================

const analyzeDataTool: ToolImplementation = {
  name: 'analyze_data',
  description: 'Analyze data and return insights, statistics, or patterns',

  async execute(params: ToolExecutionParams): Promise<ToolResult> {
    const { args } = params;
    const data = args.data || args.input;
    const analysisType = (args.type as string) || 'summary';

    if (!data) {
      return {
        success: false,
        output: null,
        error: 'Data is required for analysis',
      };
    }

    if (!isLLMConfigured()) {
      return {
        success: false,
        output: null,
        error: 'LLM not configured. Set VITE_LITELLM_API_BASE and VITE_LITELLM_API_KEY.',
      };
    }

    const startTime = Date.now();
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

    const systemPrompt = `You are a data analyst. Analyze the provided data and return structured insights.

Analysis type requested: ${analysisType}

Return a JSON object with these exact fields:
{
  "summary": "1-2 sentence summary of findings",
  "insights": ["insight 1", "insight 2", ...],
  "statistics": { "key": value, ... },
  "recommendations": ["recommendation 1", ...]
}

For sentiment analysis, statistics should include: {"positive": 0.0-1.0, "neutral": 0.0-1.0, "negative": 0.0-1.0}
For trend analysis, statistics should include: {"growthRate": number, "trendStrength": 0.0-1.0, "direction": "up|down|stable"}
For summary analysis, include relevant counts and metrics.

Return ONLY valid JSON, no markdown or explanation.`;

    const userPrompt = `Analyze this data (${analysisType} analysis):\n\n${dataStr.substring(0, 4000)}`;

    try {
      const response = await generateWithSystem(systemPrompt, userPrompt, {
        temperature: 0.3,
        maxTokens: 1024,
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Invalid response format from LLM');
      }

      const analysis = JSON.parse(jsonMatch[0]);

      return {
        success: true,
        output: analysis,
        metadata: {
          executionTimeMs: Date.now() - startTime,
          analysisType,
          dataType: typeof data,
          source: 'llm',
        },
      };
    } catch (error) {
      return {
        success: false,
        output: null,
        error: error instanceof Error ? error.message : 'Analysis failed',
        metadata: { executionTimeMs: Date.now() - startTime },
      };
    }
  },
};

// ============================================================================
// Summarize Tool (LLM-powered)
// ============================================================================

const summarizeTool: ToolImplementation = {
  name: 'summarize',
  description: 'Generate a summary of the provided content',

  async execute(params: ToolExecutionParams): Promise<ToolResult> {
    const { args } = params;
    const content = (args.content as string) || (args.input as string) || '';
    const length = (args.length as 'short' | 'medium' | 'long') || 'medium';

    if (!content.trim()) {
      return {
        success: false,
        output: null,
        error: 'Content is required for summarization',
      };
    }

    if (!isLLMConfigured()) {
      return {
        success: false,
        output: null,
        error: 'LLM not configured. Set VITE_LITELLM_API_BASE and VITE_LITELLM_API_KEY.',
      };
    }

    const startTime = Date.now();

    const lengthGuide: Record<string, string> = {
      short: '1-2 sentences (about 30-50 words)',
      medium: '3-4 sentences (about 75-100 words)',
      long: '5-7 sentences (about 150-200 words)',
    };

    const systemPrompt = `You are a summarization expert. Create a ${length} summary.

Target length: ${lengthGuide[length]}

Guidelines:
- Capture the key points and main ideas
- Maintain the original tone and intent
- Be concise but comprehensive
- Do not add information not in the original

Return ONLY the summary text, no preamble or explanation.`;

    try {
      const response = await generateWithSystem(systemPrompt, content.substring(0, 8000), {
        temperature: 0.3,
        maxTokens: 512,
      });

      const summary = response.trim();

      return {
        success: true,
        output: {
          originalLength: content.length,
          summaryLength: summary.length,
          compressionRatio: (summary.length / content.length).toFixed(2),
          summary,
        },
        metadata: {
          executionTimeMs: Date.now() - startTime,
          source: 'llm',
        },
      };
    } catch (error) {
      return {
        success: false,
        output: null,
        error: error instanceof Error ? error.message : 'Summarization failed',
        metadata: { executionTimeMs: Date.now() - startTime },
      };
    }
  },
};

// ============================================================================
// Format Markdown Tool (Hybrid: deterministic for simple, LLM for complex)
// ============================================================================

const formatMarkdownTool: ToolImplementation = {
  name: 'format_markdown',
  description: 'Format content as properly structured markdown',

  async execute(params: ToolExecutionParams): Promise<ToolResult> {
    const { args } = params;
    const content = (args.content as string) || (args.input as string) || '';
    const format = (args.format as string) || 'document';

    if (!content.trim()) {
      return {
        success: false,
        output: null,
        error: 'Content is required for formatting',
      };
    }

    // Simple formats - deterministic (fast, reliable)
    if (['list', 'code', 'blockquote', 'table'].includes(format)) {
      return formatSimple(content, format, args);
    }

    // Complex formats ('document', 'auto') - use LLM for intelligent structuring
    if (isLLMConfigured()) {
      return formatWithLLM(content, format, args);
    }

    // Fallback to simple document format if LLM not configured
    return formatSimple(content, 'document', args);
  },
};

function formatSimple(
  content: string,
  format: string,
  args: Record<string, unknown>
): ToolResult {
  let formatted: string;

  switch (format) {
    case 'list':
      formatted = formatAsList(content);
      break;
    case 'table':
      formatted = formatAsTable(content, args.headers as string[] | undefined);
      break;
    case 'code':
      formatted = formatAsCode(content, (args.language as string) || 'text');
      break;
    case 'blockquote':
      formatted = formatAsBlockquote(content);
      break;
    case 'document':
    default:
      formatted = formatAsDocument(content, (args.title as string) || 'Document');
  }

  return {
    success: true,
    output: {
      original: content,
      formatted,
      format,
    },
  };
}

async function formatWithLLM(
  content: string,
  format: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const startTime = Date.now();
  const title = (args.title as string) || 'Document';

  const systemPrompt = `You are a markdown formatting expert. Format the following content into a well-structured markdown document.

Requirements:
- Use appropriate heading levels (# ## ###)
- Add bullet points or numbered lists where appropriate
- Use emphasis (*bold*, _italic_) for important terms
- Add code blocks for any code snippets
- Maintain clear paragraph separation
- Title: "${title}"

Return ONLY the formatted markdown, no explanation.`;

  try {
    const response = await generateWithSystem(systemPrompt, content, {
      temperature: 0.2,
      maxTokens: 2048,
    });

    return {
      success: true,
      output: {
        original: content,
        formatted: response.trim(),
        format,
      },
      metadata: {
        executionTimeMs: Date.now() - startTime,
        source: 'llm',
      },
    };
  } catch {
    // Fall back to simple formatting on LLM error
    return formatSimple(content, 'document', args);
  }
}

function formatAsList(content: string): string {
  const items = content.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
  return items.map((item) => `- ${item}`).join('\n');
}

function formatAsTable(content: string, headers?: string[]): string {
  const rows = content.split('\n').map((row) => row.split(/[,\t]+/).map((s) => s.trim()));
  const effectiveHeaders = headers || rows[0] || ['Column 1', 'Column 2'];
  const dataRows = headers ? rows : rows.slice(1);

  let table = `| ${effectiveHeaders.join(' | ')} |\n`;
  table += `| ${effectiveHeaders.map(() => '---').join(' | ')} |\n`;
  for (const row of dataRows) {
    table += `| ${row.join(' | ')} |\n`;
  }

  return table;
}

function formatAsCode(content: string, language: string): string {
  return `\`\`\`${language}\n${content}\n\`\`\``;
}

function formatAsBlockquote(content: string): string {
  return content.split('\n').map((line) => `> ${line}`).join('\n');
}

function formatAsDocument(content: string, title: string): string {
  const sections = content.split(/\n\n+/);
  let doc = `# ${title}\n\n`;

  for (let i = 0; i < sections.length; i++) {
    if (i === 0) {
      doc += `${sections[i]}\n\n`;
    } else {
      doc += `## Section ${i}\n\n${sections[i]}\n\n`;
    }
  }

  return doc.trim();
}

// ============================================================================
// Calculate Tool (Deterministic - no LLM needed)
// ============================================================================

const calculateTool: ToolImplementation = {
  name: 'calculate',
  description: 'Perform mathematical calculations and return results',

  async execute(params: ToolExecutionParams): Promise<ToolResult> {
    const { args } = params;
    const expression = (args.expression as string) || (args.input as string) || '';

    if (!expression.trim()) {
      return {
        success: false,
        output: null,
        error: 'Mathematical expression is required',
      };
    }

    try {
      const result = safeEvaluate(expression);

      return {
        success: true,
        output: {
          expression,
          result,
          formatted: formatNumber(result),
        },
      };
    } catch (error) {
      return {
        success: false,
        output: null,
        error: error instanceof Error ? error.message : 'Calculation error',
      };
    }
  },
};

function safeEvaluate(expression: string): number {
  // Only allow numbers, operators, parentheses, and basic math functions
  const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '');

  // Parse and evaluate simple expressions
  const tokens = sanitized.match(/(\d+\.?\d*|[+\-*/()%])/g);
  if (!tokens) throw new Error('Invalid expression');

  // Basic evaluation (handles simple cases)
  let result = 0;
  let currentOp = '+';
  let currentNum = 0;

  for (const token of tokens) {
    if (['+', '-', '*', '/', '%'].includes(token)) {
      switch (currentOp) {
        case '+':
          result += currentNum;
          break;
        case '-':
          result -= currentNum;
          break;
        case '*':
          result *= currentNum;
          break;
        case '/':
          if (currentNum === 0) throw new Error('Division by zero');
          result /= currentNum;
          break;
        case '%':
          result %= currentNum;
          break;
      }
      currentOp = token;
      currentNum = 0;
    } else if (token !== '(' && token !== ')') {
      currentNum = parseFloat(token);
    }
  }

  // Apply final operation
  switch (currentOp) {
    case '+':
      result += currentNum;
      break;
    case '-':
      result -= currentNum;
      break;
    case '*':
      result *= currentNum;
      break;
    case '/':
      if (currentNum === 0) throw new Error('Division by zero');
      result /= currentNum;
      break;
    case '%':
      result %= currentNum;
      break;
  }

  return result;
}

function formatNumber(num: number): string {
  if (Number.isInteger(num)) {
    return num.toLocaleString();
  }
  return num.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

// ============================================================================
// Tool Registration
// ============================================================================

// All built-in tools
const builtinTools: ToolImplementation[] = [
  knowledgeQueryTool,
  webSearchTool, // Alias for backwards compatibility
  formatMarkdownTool,
  analyzeDataTool,
  brainstormTool,
  calculateTool,
  summarizeTool,
];

/**
 * Register all built-in tools with the registry
 */
export function registerBuiltinTools(): void {
  toolRegistry.registerAll(builtinTools);
}

// Export individual tools for testing
export {
  knowledgeQueryTool,
  webSearchTool,
  formatMarkdownTool,
  analyzeDataTool,
  brainstormTool,
  calculateTool,
  summarizeTool,
  builtinTools,
};
