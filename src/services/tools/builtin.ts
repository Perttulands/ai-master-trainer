/**
 * Built-in Tool Implementations
 *
 * Simulated tools for MVP. These provide realistic-looking outputs
 * without requiring external API calls. In production, these would
 * be replaced with real implementations.
 */

import { toolRegistry, type ToolImplementation, type ToolResult, type ToolExecutionParams } from './registry';

/**
 * Simulated web search tool
 * Returns mock search results based on the query
 */
const webSearchTool: ToolImplementation = {
  name: 'web_search',
  description: 'Search the web for information on a given topic',

  async execute(params: ToolExecutionParams): Promise<ToolResult> {
    const { args } = params;
    const query = (args.query as string) || '';

    if (!query.trim()) {
      return {
        success: false,
        output: null,
        error: 'Search query is required',
      };
    }

    // Simulate search delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Generate mock search results based on the query
    const results = generateMockSearchResults(query);

    return {
      success: true,
      output: {
        query,
        totalResults: results.length,
        results,
      },
      metadata: {
        executionTimeMs: 100,
        source: 'simulated',
      },
    };
  },
};

/**
 * Generate mock search results based on query keywords
 */
function generateMockSearchResults(query: string): Array<{
  title: string;
  url: string;
  snippet: string;
}> {
  const keywords = query.toLowerCase().split(/\s+/);
  const baseResults = [
    {
      title: `${capitalize(keywords[0])} - Wikipedia`,
      url: `https://en.wikipedia.org/wiki/${keywords[0]}`,
      snippet: `Learn about ${query}. This comprehensive article covers the key aspects and provides detailed information.`,
    },
    {
      title: `A Complete Guide to ${capitalize(query)}`,
      url: `https://example.com/guides/${keywords.join('-')}`,
      snippet: `Everything you need to know about ${query}. Our expert guide covers best practices, tips, and common pitfalls.`,
    },
    {
      title: `${capitalize(query)} - Latest News and Updates`,
      url: `https://news.example.com/${keywords.join('-')}`,
      snippet: `Stay up to date with the latest developments in ${query}. Breaking news and in-depth analysis.`,
    },
    {
      title: `How to ${query} - Step by Step Tutorial`,
      url: `https://tutorials.example.com/${keywords.join('-')}`,
      snippet: `A beginner-friendly tutorial on ${query}. Follow our step-by-step instructions to get started.`,
    },
    {
      title: `${capitalize(keywords[0])} Best Practices - Expert Advice`,
      url: `https://blog.example.com/best-practices/${keywords[0]}`,
      snippet: `Industry experts share their insights on ${query}. Learn from the best to improve your results.`,
    },
  ];

  return baseResults;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Markdown formatting tool
 * Formats content with proper markdown structure
 */
const formatMarkdownTool: ToolImplementation = {
  name: 'format_markdown',
  description: 'Format content as properly structured markdown',

  async execute(params: ToolExecutionParams): Promise<ToolResult> {
    const { args } = params;
    const content = (args.content as string) || '';
    const format = (args.format as string) || 'document';

    if (!content.trim()) {
      return {
        success: false,
        output: null,
        error: 'Content is required for formatting',
      };
    }

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
  },
};

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

/**
 * Data analysis tool
 * Returns mock data analysis results
 */
const analyzeDataTool: ToolImplementation = {
  name: 'analyze_data',
  description: 'Analyze data and return insights, statistics, or patterns',

  async execute(params: ToolExecutionParams): Promise<ToolResult> {
    const { args } = params;
    const data = args.data;
    const analysisType = (args.type as string) || 'summary';

    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Generate mock analysis based on the type
    const analysis = generateMockAnalysis(data, analysisType);

    return {
      success: true,
      output: analysis,
      metadata: {
        executionTimeMs: 150,
        analysisType,
        dataType: typeof data,
      },
    };
  },
};

function generateMockAnalysis(
  data: unknown,
  analysisType: string
): {
  summary: string;
  insights: string[];
  statistics?: Record<string, number>;
  recommendations?: string[];
} {
  const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
  const wordCount = dataStr.split(/\s+/).length;

  const baseAnalysis = {
    summary: `Analysis of ${wordCount} data points completed. The data shows patterns consistent with typical ${analysisType} analysis.`,
    insights: [
      'Primary trend: Data shows consistent patterns over the analyzed period',
      'Secondary trend: Notable variations detected in key metrics',
      'Anomaly detection: No significant outliers identified',
      'Correlation: Strong relationship found between primary variables',
    ],
    statistics: {
      dataPoints: wordCount,
      uniqueValues: Math.floor(wordCount * 0.7),
      completeness: 0.95,
      confidence: 0.87,
    },
    recommendations: [
      'Consider expanding the dataset for more robust analysis',
      'Monitor the identified trends for changes over time',
      'Validate findings against external data sources',
    ],
  };

  if (analysisType === 'sentiment') {
    return {
      ...baseAnalysis,
      summary: `Sentiment analysis of ${wordCount} text units completed.`,
      insights: [
        'Overall sentiment: Moderately positive',
        'Emotional tone: Professional with neutral undertones',
        'Key themes: Efficiency, quality, improvement',
        'Audience reception: Likely favorable',
      ],
      statistics: {
        positive: 0.45,
        neutral: 0.35,
        negative: 0.2,
        confidence: 0.82,
      },
    };
  }

  if (analysisType === 'trend') {
    return {
      ...baseAnalysis,
      summary: `Trend analysis across ${wordCount} data points completed.`,
      insights: [
        'Direction: Upward trend with moderate growth rate',
        'Seasonality: Cyclical patterns detected',
        'Volatility: Within normal ranges',
        'Forecast: Continued growth expected',
      ],
      statistics: {
        growthRate: 0.12,
        trendStrength: 0.78,
        seasonalityIndex: 0.34,
        forecastConfidence: 0.75,
      },
    };
  }

  return baseAnalysis;
}

/**
 * Brainstorming tool
 * Generates creative ideas based on a topic
 * Commonly used by Creative strategy agents
 */
const brainstormTool: ToolImplementation = {
  name: 'brainstorm',
  description: 'Generate creative ideas and suggestions for a given topic or problem',

  async execute(params: ToolExecutionParams): Promise<ToolResult> {
    const { args } = params;
    const topic = (args.topic as string) || '';
    const count = Math.min((args.count as number) || 5, 10);
    const style = (args.style as string) || 'creative';

    if (!topic.trim()) {
      return {
        success: false,
        output: null,
        error: 'Topic is required for brainstorming',
      };
    }

    // Simulate thinking delay
    await new Promise((resolve) => setTimeout(resolve, 200));

    const ideas = generateBrainstormIdeas(topic, count, style);

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
        executionTimeMs: 200,
      },
    };
  },
};

function generateBrainstormIdeas(
  topic: string,
  count: number,
  style: string
): Array<{
  idea: string;
  rationale: string;
  feasibility: 'high' | 'medium' | 'low';
  innovationScore: number;
}> {
  const keywords = topic.toLowerCase().split(/\s+/).slice(0, 3);
  const mainKeyword = keywords[0] || 'concept';

  const ideaTemplates = {
    creative: [
      { prefix: 'Reimagine', suffix: 'using an unconventional approach' },
      { prefix: 'Combine', suffix: 'with an unexpected element' },
      { prefix: 'Transform', suffix: 'into an interactive experience' },
      { prefix: 'Personalize', suffix: 'for individual user needs' },
      { prefix: 'Gamify', suffix: 'to increase engagement' },
      { prefix: 'Simplify', suffix: 'to its essential core' },
      { prefix: 'Visualize', suffix: 'in a new format' },
      { prefix: 'Automate', suffix: 'the repetitive aspects' },
      { prefix: 'Collaborate', suffix: 'with diverse stakeholders' },
      { prefix: 'Experiment', suffix: 'with emerging technologies' },
    ],
    practical: [
      { prefix: 'Streamline', suffix: 'to reduce complexity' },
      { prefix: 'Document', suffix: 'for better reproducibility' },
      { prefix: 'Measure', suffix: 'to enable data-driven decisions' },
      { prefix: 'Integrate', suffix: 'with existing workflows' },
      { prefix: 'Standardize', suffix: 'for consistency' },
      { prefix: 'Optimize', suffix: 'for performance' },
      { prefix: 'Scale', suffix: 'to handle growth' },
      { prefix: 'Secure', suffix: 'against potential risks' },
      { prefix: 'Train', suffix: 'users for better adoption' },
      { prefix: 'Iterate', suffix: 'based on feedback' },
    ],
    innovative: [
      { prefix: 'Disrupt', suffix: 'the traditional model' },
      { prefix: 'Pioneer', suffix: 'a new paradigm' },
      { prefix: 'Synthesize', suffix: 'cross-domain insights' },
      { prefix: 'Leverage AI for', suffix: 'intelligent automation' },
      { prefix: 'Decentralize', suffix: 'for greater resilience' },
      { prefix: 'Predict', suffix: 'future trends and needs' },
      { prefix: 'Personalize at scale', suffix: 'using machine learning' },
      { prefix: 'Create ecosystem around', suffix: 'for network effects' },
      { prefix: 'Apply quantum thinking to', suffix: 'for breakthrough solutions' },
      { prefix: 'Biomimicry approach to', suffix: 'for nature-inspired design' },
    ],
  };

  const templates = ideaTemplates[style as keyof typeof ideaTemplates] || ideaTemplates.creative;
  const selectedTemplates = templates.slice(0, count);

  return selectedTemplates.map((template, index) => ({
    idea: `${template.prefix} ${topic} ${template.suffix}`,
    rationale: `This approach leverages ${mainKeyword} strengths while addressing common limitations through ${template.prefix.toLowerCase()}ing.`,
    feasibility: index < count / 3 ? 'high' : index < (count * 2) / 3 ? 'medium' : 'low',
    innovationScore: 0.5 + Math.random() * 0.5,
  }));
}

/**
 * Calculate tool - performs basic calculations
 */
const calculateTool: ToolImplementation = {
  name: 'calculate',
  description: 'Perform mathematical calculations and return results',

  async execute(params: ToolExecutionParams): Promise<ToolResult> {
    const { args } = params;
    const expression = (args.expression as string) || '';

    if (!expression.trim()) {
      return {
        success: false,
        output: null,
        error: 'Mathematical expression is required',
      };
    }

    try {
      // Simple safe evaluation for basic math (no eval for security)
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
  // This is a simplified implementation - in production use a proper math parser
  const tokens = sanitized.match(/(\d+\.?\d*|[+\-*/()%])/g);
  if (!tokens) throw new Error('Invalid expression');

  // Very basic evaluation (handles simple cases)
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

/**
 * Summarize tool - generates summaries of content
 */
const summarizeTool: ToolImplementation = {
  name: 'summarize',
  description: 'Generate a summary of the provided content',

  async execute(params: ToolExecutionParams): Promise<ToolResult> {
    const { args } = params;
    const content = (args.content as string) || '';
    const length = (args.length as 'short' | 'medium' | 'long') || 'medium';

    if (!content.trim()) {
      return {
        success: false,
        output: null,
        error: 'Content is required for summarization',
      };
    }

    // Simulate processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    const summary = generateSummary(content, length);

    return {
      success: true,
      output: {
        originalLength: content.length,
        summaryLength: summary.length,
        compressionRatio: (summary.length / content.length).toFixed(2),
        summary,
      },
    };
  },
};

function generateSummary(content: string, length: 'short' | 'medium' | 'long'): string {
  const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 10);
  const wordCount = content.split(/\s+/).length;

  const targetSentences = {
    short: Math.min(2, sentences.length),
    medium: Math.min(4, sentences.length),
    long: Math.min(6, sentences.length),
  };

  const selectedSentences = sentences.slice(0, targetSentences[length]);
  const summaryText = selectedSentences.join('. ').trim();

  return `${summaryText}${summaryText.endsWith('.') ? '' : '.'} [Summary of ${wordCount} words in ${sentences.length} sentences]`;
}

// All built-in tools
const builtinTools: ToolImplementation[] = [
  webSearchTool,
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
  webSearchTool,
  formatMarkdownTool,
  analyzeDataTool,
  brainstormTool,
  calculateTool,
  summarizeTool,
  builtinTools,
};
