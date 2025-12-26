# /agent - Create ADK Agent

Create a new Google ADK agent with proper structure.

## Arguments

$ARGUMENTS - Agent name and type

## Steps

1. Parse agent name from arguments (e.g., "lineage-executor")
2. Create agent directory: `src/agents/{agent-name}/`
3. Create files:
   - `index.ts` - Agent definition
   - `tools.ts` - Agent tools/functions
   - `prompts.ts` - System prompts and templates
4. Register agent in `src/agents/index.ts`

## Agent Template

```typescript
import { Agent } from '@google/adk';
import { tools } from './tools';
import { SYSTEM_PROMPT } from './prompts';

export const {agentName}Agent = new Agent({
  name: '{agent-name}',
  description: '{description}',
  systemPrompt: SYSTEM_PROMPT,
  tools
});
```

## Example

`/agent lineage-executor` creates:
- `src/agents/lineage-executor/index.ts`
- `src/agents/lineage-executor/tools.ts`
- `src/agents/lineage-executor/prompts.ts`
