import type { AgentFlowStep } from '../../types/agent';
import { generateId } from '../../utils/id';

/**
 * Creates a simple 3-step flow: start -> prompt -> output
 * Best for concise, fast-response agents
 */
export function createSimpleFlow(): AgentFlowStep[] {
  const startId = generateId();
  const promptId = generateId();
  const outputId = generateId();

  return [
    {
      id: startId,
      type: 'start',
      name: 'Start',
      config: {},
      position: { x: 100, y: 100 },
      connections: {
        next: promptId,
      },
    },
    {
      id: promptId,
      type: 'prompt',
      name: 'Process Request',
      config: {
        promptTemplate: '{{input}}',
      },
      position: { x: 100, y: 200 },
      connections: {
        next: outputId,
      },
    },
    {
      id: outputId,
      type: 'output',
      name: 'Return Result',
      config: {
        outputFormat: 'text',
      },
      position: { x: 100, y: 300 },
      connections: {},
    },
  ];
}

/**
 * Creates a flow with a tool step: start -> prompt -> tool -> output
 * Good for agents that need to use external resources
 */
export function createToolFlow(toolName: string): AgentFlowStep[] {
  const startId = generateId();
  const promptId = generateId();
  const toolId = generateId();
  const outputId = generateId();

  return [
    {
      id: startId,
      type: 'start',
      name: 'Start',
      config: {},
      position: { x: 100, y: 100 },
      connections: {
        next: promptId,
      },
    },
    {
      id: promptId,
      type: 'prompt',
      name: 'Analyze Request',
      config: {
        promptTemplate: 'Analyze the following request and prepare tool input:\n\n{{input}}',
      },
      position: { x: 100, y: 200 },
      connections: {
        next: toolId,
      },
    },
    {
      id: toolId,
      type: 'tool',
      name: `Execute ${toolName}`,
      config: {
        toolName,
        inputMapping: '{{promptOutput}}',
      },
      position: { x: 100, y: 300 },
      connections: {
        next: outputId,
        onError: outputId,
      },
    },
    {
      id: outputId,
      type: 'output',
      name: 'Return Result',
      config: {
        outputFormat: 'structured',
        includeToolResults: true,
      },
      position: { x: 100, y: 400 },
      connections: {},
    },
  ];
}

/**
 * Creates a conditional flow: start -> prompt -> condition -> (tool or output)
 * Allows branching based on analysis results
 */
export function createConditionalFlow(): AgentFlowStep[] {
  const startId = generateId();
  const promptId = generateId();
  const conditionId = generateId();
  const toolId = generateId();
  const outputId = generateId();

  return [
    {
      id: startId,
      type: 'start',
      name: 'Start',
      config: {},
      position: { x: 200, y: 100 },
      connections: {
        next: promptId,
      },
    },
    {
      id: promptId,
      type: 'prompt',
      name: 'Analyze & Decide',
      config: {
        promptTemplate:
          'Analyze the request and determine if external tools are needed:\n\n{{input}}\n\nRespond with JSON: { "needsTool": boolean, "toolInput": string, "directAnswer": string }',
        outputFormat: 'json',
      },
      position: { x: 200, y: 200 },
      connections: {
        next: conditionId,
      },
    },
    {
      id: conditionId,
      type: 'condition',
      name: 'Needs Tool?',
      config: {
        expression: '{{promptOutput.needsTool}} === true',
        evaluator: 'javascript',
      },
      position: { x: 200, y: 300 },
      connections: {
        onTrue: toolId,
        onFalse: outputId,
      },
    },
    {
      id: toolId,
      type: 'tool',
      name: 'Execute Tool',
      config: {
        toolName: 'dynamic',
        inputMapping: '{{promptOutput.toolInput}}',
      },
      position: { x: 50, y: 400 },
      connections: {
        next: outputId,
        onError: outputId,
      },
    },
    {
      id: outputId,
      type: 'output',
      name: 'Return Result',
      config: {
        outputFormat: 'adaptive',
        includeToolResults: true,
        fallbackToDirectAnswer: true,
      },
      position: { x: 200, y: 500 },
      connections: {},
    },
  ];
}

/**
 * Creates a loop flow for iterative processing
 * Useful for agents that need to refine outputs
 */
export function createLoopFlow(maxIterations: number = 3): AgentFlowStep[] {
  const startId = generateId();
  const promptId = generateId();
  const loopId = generateId();
  const refineId = generateId();
  const outputId = generateId();

  return [
    {
      id: startId,
      type: 'start',
      name: 'Start',
      config: {},
      position: { x: 200, y: 100 },
      connections: {
        next: promptId,
      },
    },
    {
      id: promptId,
      type: 'prompt',
      name: 'Initial Generation',
      config: {
        promptTemplate: 'Generate initial response for:\n\n{{input}}',
      },
      position: { x: 200, y: 200 },
      connections: {
        next: loopId,
      },
    },
    {
      id: loopId,
      type: 'loop',
      name: 'Refinement Loop',
      config: {
        maxIterations,
        conditionExpression: '{{iteration}} < {{maxIterations}} && !{{promptOutput.isSatisfactory}}',
      },
      position: { x: 200, y: 300 },
      connections: {
        next: refineId,
        onFalse: outputId,
      },
    },
    {
      id: refineId,
      type: 'prompt',
      name: 'Refine Output',
      config: {
        promptTemplate:
          'Review and improve this output:\n\n{{previousOutput}}\n\nOriginal request: {{input}}\n\nProvide an improved version and set isSatisfactory to true if no further improvements are needed.',
        outputFormat: 'json',
      },
      position: { x: 200, y: 400 },
      connections: {
        next: loopId,
      },
    },
    {
      id: outputId,
      type: 'output',
      name: 'Return Final Result',
      config: {
        outputFormat: 'text',
        extractField: 'content',
      },
      position: { x: 200, y: 500 },
      connections: {},
    },
  ];
}

/**
 * Creates a multi-tool flow with parallel execution support
 * For agents that need to gather information from multiple sources
 */
export function createMultiToolFlow(toolNames: string[]): AgentFlowStep[] {
  const startId = generateId();
  const promptId = generateId();
  const outputId = generateId();

  const steps: AgentFlowStep[] = [
    {
      id: startId,
      type: 'start',
      name: 'Start',
      config: {},
      position: { x: 200, y: 100 },
      connections: {
        next: promptId,
      },
    },
    {
      id: promptId,
      type: 'prompt',
      name: 'Plan Tool Usage',
      config: {
        promptTemplate:
          'Analyze the request and plan which tools to use:\n\n{{input}}\n\nAvailable tools: ' +
          toolNames.join(', '),
      },
      position: { x: 200, y: 200 },
      connections: {},
    },
  ];

  // Add tool steps
  const yOffset = 300;
  toolNames.forEach((toolName, index) => {
    const toolId = generateId();
    steps[steps.length - 1].connections.next = toolId;

    steps.push({
      id: toolId,
      type: 'tool',
      name: `Execute ${toolName}`,
      config: {
        toolName,
        inputMapping: '{{promptOutput}}',
      },
      position: { x: 200, y: yOffset + index * 100 },
      connections: {
        onError: outputId,
      },
    });
  });

  // Connect last tool to output
  steps[steps.length - 1].connections.next = outputId;

  steps.push({
    id: outputId,
    type: 'output',
    name: 'Aggregate Results',
    config: {
      outputFormat: 'structured',
      includeToolResults: true,
      aggregationStrategy: 'merge',
    },
    position: { x: 200, y: yOffset + toolNames.length * 100 },
    connections: {},
  });

  return steps;
}
