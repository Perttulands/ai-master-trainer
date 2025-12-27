import type {
  AgentDefinition,
  AgentTool,
  AgentMemoryConfig,
  AgentParameters,
} from '../../types/agent';
import { generateId } from '../../utils/id';
import { createSimpleFlow, createToolFlow, createConditionalFlow, createLoopFlow } from './flow-templates';

type LineageLabel = 'A' | 'B' | 'C' | 'D';

interface StrategyTemplate {
  name: string;
  description: string;
  systemPromptTemplate: (need: string, constraints?: string) => string;
  tools: AgentTool[];
  createFlow: () => ReturnType<typeof createSimpleFlow>;
  memory: AgentMemoryConfig;
  parameters: AgentParameters;
}

// === TOOL DEFINITIONS ===

const searchTool: AgentTool = {
  id: generateId(),
  name: 'search',
  description: 'Search for information on a topic',
  type: 'builtin',
  config: {
    builtinName: 'web_search',
  },
  parameters: [
    {
      name: 'query',
      type: 'string',
      description: 'The search query',
      required: true,
    },
  ],
};

const analyzeTool: AgentTool = {
  id: generateId(),
  name: 'analyze',
  description: 'Analyze data or text for insights',
  type: 'builtin',
  config: {
    builtinName: 'text_analysis',
  },
  parameters: [
    {
      name: 'content',
      type: 'string',
      description: 'The content to analyze',
      required: true,
    },
    {
      name: 'analysisType',
      type: 'string',
      description: 'Type of analysis: sentiment, summary, entities, or keywords',
      required: false,
    },
  ],
};

const generateTool: AgentTool = {
  id: generateId(),
  name: 'generate',
  description: 'Generate structured content based on a template',
  type: 'builtin',
  config: {
    builtinName: 'content_generator',
  },
  parameters: [
    {
      name: 'template',
      type: 'string',
      description: 'The template to use for generation',
      required: true,
    },
    {
      name: 'variables',
      type: 'object',
      description: 'Variables to fill in the template',
      required: false,
    },
  ],
};

const validateTool: AgentTool = {
  id: generateId(),
  name: 'validate',
  description: 'Validate output against criteria',
  type: 'builtin',
  config: {
    builtinName: 'output_validator',
  },
  parameters: [
    {
      name: 'content',
      type: 'string',
      description: 'The content to validate',
      required: true,
    },
    {
      name: 'criteria',
      type: 'array',
      description: 'List of validation criteria',
      required: true,
    },
  ],
};

const brainstormTool: AgentTool = {
  id: generateId(),
  name: 'brainstorm',
  description: 'Generate creative ideas and alternatives',
  type: 'builtin',
  config: {
    builtinName: 'idea_generator',
  },
  parameters: [
    {
      name: 'topic',
      type: 'string',
      description: 'The topic to brainstorm about',
      required: true,
    },
    {
      name: 'count',
      type: 'number',
      description: 'Number of ideas to generate',
      required: false,
    },
  ],
};

const experimentTool: AgentTool = {
  id: generateId(),
  name: 'experiment',
  description: 'Try unconventional approaches and techniques',
  type: 'builtin',
  config: {
    builtinName: 'experimental_processor',
  },
  parameters: [
    {
      name: 'approach',
      type: 'string',
      description: 'The experimental approach to try',
      required: true,
    },
    {
      name: 'input',
      type: 'string',
      description: 'Input to process experimentally',
      required: true,
    },
  ],
};

// === STRATEGY TEMPLATES ===

const strategyTemplates: Record<LineageLabel, StrategyTemplate> = {
  // Strategy A - "Concise": Minimal tools, short prompts, fast responses
  A: {
    name: 'Concise',
    description: 'Minimal approach with fast, direct responses',
    systemPromptTemplate: (need: string, constraints?: string) => {
      let prompt = `You are a concise assistant. Your goal: ${need}

Guidelines:
- Be brief and direct
- Provide essential information only
- Avoid unnecessary elaboration
- Respond quickly with actionable answers`;

      if (constraints) {
        prompt += `\n\nConstraints: ${constraints}`;
      }

      return prompt;
    },
    tools: [], // No tools for maximum speed
    createFlow: createSimpleFlow,
    memory: {
      type: 'none',
      config: {},
    },
    parameters: {
      model: 'claude-sonnet-4-20250514',
      temperature: 0.3, // Lower temperature for consistent, focused responses
      maxTokens: 512, // Limited tokens for brevity
      topP: 0.9,
    },
  },

  // Strategy B - "Detailed": More tools, comprehensive prompts
  B: {
    name: 'Detailed',
    description: 'Comprehensive approach with thorough analysis',
    systemPromptTemplate: (need: string, constraints?: string) => {
      let prompt = `You are a thorough and detailed assistant. Your primary objective: ${need}

Guidelines:
- Provide comprehensive, well-structured responses
- Consider multiple perspectives and edge cases
- Include relevant context and background
- Use available tools to gather and validate information
- Organize responses with clear sections when appropriate
- Cite sources and reasoning when making claims

Approach:
1. Understand the full scope of the request
2. Gather relevant information using available tools
3. Analyze and synthesize findings
4. Present a complete, well-reasoned response`;

      if (constraints) {
        prompt += `\n\nConstraints to respect:\n${constraints}`;
      }

      return prompt;
    },
    tools: [searchTool, analyzeTool, generateTool], // 3 tools for comprehensive work
    createFlow: () => createToolFlow('analyze'),
    memory: {
      type: 'buffer',
      config: {
        maxMessages: 10,
        maxTokens: 4000,
      },
    },
    parameters: {
      model: 'claude-sonnet-4-20250514',
      temperature: 0.5, // Moderate temperature for balance
      maxTokens: 2048, // More tokens for detailed responses
      topP: 0.95,
    },
  },

  // Strategy C - "Creative": Experimental approaches, unique tool combinations
  C: {
    name: 'Creative',
    description: 'Experimental approach with innovative solutions',
    systemPromptTemplate: (need: string, constraints?: string) => {
      let prompt = `You are a creative and innovative assistant. Your mission: ${need}

Creative Guidelines:
- Think outside the box and explore unconventional solutions
- Combine ideas from different domains
- Challenge assumptions and propose alternatives
- Experiment with different approaches and formats
- Take calculated risks in your suggestions
- Embrace ambiguity and turn it into opportunity

Creative Process:
1. Reframe the problem from multiple angles
2. Brainstorm diverse possibilities without judgment
3. Experiment with unexpected combinations
4. Refine and iterate on promising ideas
5. Present options with their unique trade-offs

Remember: Innovation comes from exploring the edges, not the center.`;

      if (constraints) {
        prompt += `\n\nCreative boundaries (not limitations, but parameters for innovation):\n${constraints}`;
      }

      return prompt;
    },
    tools: [brainstormTool, experimentTool, generateTool], // Creative tool set
    createFlow: () => createLoopFlow(3), // Iterative refinement for creativity
    memory: {
      type: 'summary',
      config: {
        maxTokens: 2000,
      },
    },
    parameters: {
      model: 'claude-sonnet-4-20250514',
      temperature: 0.8, // Higher temperature for creativity
      maxTokens: 1500,
      topP: 0.98, // More diverse token selection
      frequencyPenalty: 0.3, // Encourage novel word choices
      presencePenalty: 0.2, // Encourage exploring new topics
    },
  },

  // Strategy D - "Balanced": Middle ground between concise and detailed
  D: {
    name: 'Balanced',
    description: 'Adaptive approach balancing thoroughness and efficiency',
    systemPromptTemplate: (need: string, constraints?: string) => {
      let prompt = `You are a balanced and adaptive assistant. Your objective: ${need}

Balanced Approach:
- Gauge the complexity of each request and adjust depth accordingly
- Be concise when appropriate, detailed when necessary
- Use tools strategically, not by default
- Provide context when it adds value, skip when obvious
- Balance speed with quality

Decision Framework:
1. Assess request complexity (simple, moderate, complex)
2. Determine appropriate response depth
3. Decide if tools would genuinely add value
4. Execute with the right level of detail
5. Validate that the response matches the need

Aim for the sweet spot: comprehensive enough to be useful, concise enough to be efficient.`;

      if (constraints) {
        prompt += `\n\nOperating constraints:\n${constraints}`;
      }

      return prompt;
    },
    tools: [searchTool, validateTool], // 2 tools for practical utility
    createFlow: createConditionalFlow, // Conditional for adaptive behavior
    memory: {
      type: 'buffer',
      config: {
        maxMessages: 5,
        maxTokens: 2000,
      },
    },
    parameters: {
      model: 'claude-sonnet-4-20250514',
      temperature: 0.5, // Moderate temperature
      maxTokens: 1024, // Balanced token limit
      topP: 0.92,
    },
  },
};

// === MAIN EXPORT FUNCTION ===

/**
 * Creates an AgentDefinition based on the specified lineage strategy template.
 *
 * @param label - The lineage label (A, B, C, or D) determining the strategy
 * @param sessionNeed - The user's expressed need/goal for the session
 * @param constraints - Optional constraints to apply to the agent
 * @returns A fully configured AgentDefinition ready for use
 */
export function createAgentFromTemplate(
  label: LineageLabel,
  sessionNeed: string,
  constraints?: string
): AgentDefinition {
  const template = strategyTemplates[label];
  const now = Date.now();

  return {
    id: generateId(),
    name: `${template.name} Agent (${label})`,
    description: template.description,
    version: 1,
    systemPrompt: template.systemPromptTemplate(sessionNeed, constraints),
    tools: template.tools.map((tool) => ({
      ...tool,
      id: generateId(), // Generate fresh IDs for each agent instance
    })),
    flow: template.createFlow(),
    memory: template.memory,
    parameters: template.parameters,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Get information about a strategy without creating an agent
 */
export function getStrategyInfo(label: LineageLabel): {
  name: string;
  description: string;
  toolCount: number;
  memoryType: string;
  temperature: number;
} {
  const template = strategyTemplates[label];
  return {
    name: template.name,
    description: template.description,
    toolCount: template.tools.length,
    memoryType: template.memory.type,
    temperature: template.parameters.temperature,
  };
}

/**
 * Get all available strategy labels
 */
export function getStrategyLabels(): LineageLabel[] {
  return ['A', 'B', 'C', 'D'];
}

/**
 * Get a summary of all strategies for comparison
 */
export function getStrategySummary(): Record<
  LineageLabel,
  {
    name: string;
    description: string;
    toolCount: number;
    memoryType: string;
    temperature: number;
  }
> {
  return {
    A: getStrategyInfo('A'),
    B: getStrategyInfo('B'),
    C: getStrategyInfo('C'),
    D: getStrategyInfo('D'),
  };
}
