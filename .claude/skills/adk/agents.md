# Training Camp Agent Implementations

> **NOTE**: These examples show Anthropic SDK patterns for EXPORTED standalone agents.
> Training Camp runtime uses LiteLLM gateway (`src/api/llm.ts`) instead.
> See `src/agents/master-trainer.ts` and `src/services/agent-executor.ts` for actual runtime code.

## Master Trainer Agent (Export Example)

The core algorithm that evolves lineages based on user feedback.

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const MASTER_TRAINER_SYSTEM = `You are the Master Trainer for Training Camp.
Your job is to evolve AI agent configurations based on user feedback.

When evolving a lineage:
1. Analyze the scores (1-10) and comments
2. Identify what worked (high scores) and what didn't (low scores)
3. Generate variations that improve on weaknesses
4. Apply any user directives (sticky persist, one-shot apply once)
5. Maintain diversity across lineages to prevent convergence`;

const tools = [
  {
    name: 'analyze_scores',
    description: 'Analyze user scores and comments to identify patterns',
    input_schema: {
      type: 'object',
      properties: {
        scores: {
          type: 'array',
          items: { type: 'number' },
          description: 'User scores 1-10 for each artifact'
        },
        comments: {
          type: 'array',
          items: { type: 'string' },
          description: 'User comments on artifacts'
        }
      },
      required: ['scores']
    }
  },
  {
    name: 'generate_variation',
    description: 'Generate evolved prompt/config based on analysis',
    input_schema: {
      type: 'object',
      properties: {
        currentConfig: { type: 'object', description: 'Current lineage config' },
        analysis: { type: 'object', description: 'Score analysis results' },
        directive: { type: 'string', description: 'Optional user directive' }
      },
      required: ['currentConfig', 'analysis']
    }
  }
];

export async function evolveLinage(
  lineage: Lineage,
  scores: number[],
  comments: string[]
) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: MASTER_TRAINER_SYSTEM,
    tools,
    messages: [{
      role: 'user',
      content: `Evolve this lineage based on user feedback:

Lineage: ${lineage.label}
Current config: ${JSON.stringify(lineage.config)}
Scores: ${scores.join(', ')}
Comments: ${comments.filter(c => c).join('\n')}
Directive: ${lineage.directive || 'None'}

Analyze the feedback and generate an evolved configuration.`
    }]
  });

  // Handle tool calls in agentic loop
  return handleToolCalls(response);
}
```

## Lineage Executor Agent (Export Example)

Executes lineage configurations to produce artifacts.

```typescript
const LINEAGE_EXECUTOR_SYSTEM = `You execute a lineage configuration to produce an artifact.
Given the user's need and the lineage's evolved parameters, generate
high-quality output that fulfills the requirement.

Focus on:
- Following the specific style/approach in the lineage config
- Meeting any constraints specified
- Producing distinctive output that differs from other lineages`;

export async function generateArtifact(
  need: string,
  lineage: Lineage,
  constraints: string[]
) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: LINEAGE_EXECUTOR_SYSTEM,
    messages: [{
      role: 'user',
      content: `Generate an artifact for this need:

Need: ${need}
Lineage config: ${JSON.stringify(lineage.config)}
Strategy: ${lineage.strategyTag}
Constraints: ${constraints.join(', ') || 'None'}

Produce a high-quality artifact following the lineage's approach.`
    }]
  });

  return {
    content: response.content[0].text,
    metadata: {
      model: response.model,
      usage: response.usage
    }
  };
}
```

## Parallel Generation

```typescript
export async function generateAllLineages(
  need: string,
  lineages: Lineage[],
  constraints: string[]
) {
  // Generate artifacts for all unlocked lineages in parallel
  const unlockedLineages = lineages.filter(l => !l.isLocked);

  const results = await Promise.all(
    unlockedLineages.map(lineage =>
      generateArtifact(need, lineage, constraints)
    )
  );

  return unlockedLineages.map((lineage, i) => ({
    lineageId: lineage.id,
    artifact: results[i]
  }));
}
```

## Agentic Loop Pattern

```typescript
async function handleToolCalls(response: Anthropic.Message): Promise<any> {
  const messages: Anthropic.MessageParam[] = [];
  let currentResponse = response;

  while (currentResponse.stop_reason === 'tool_use') {
    const toolUses = currentResponse.content.filter(
      c => c.type === 'tool_use'
    );

    const toolResults = await Promise.all(
      toolUses.map(async (toolUse) => {
        const result = await executeToolCall(toolUse.name, toolUse.input);
        return {
          type: 'tool_result' as const,
          tool_use_id: toolUse.id,
          content: JSON.stringify(result)
        };
      })
    );

    messages.push(
      { role: 'assistant', content: currentResponse.content },
      { role: 'user', content: toolResults }
    );

    currentResponse = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: MASTER_TRAINER_SYSTEM,
      tools,
      messages
    });
  }

  return currentResponse;
}

async function executeToolCall(name: string, input: any) {
  switch (name) {
    case 'analyze_scores':
      return analyzeScores(input.scores, input.comments);
    case 'generate_variation':
      return generateVariation(input.currentConfig, input.analysis, input.directive);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
```
