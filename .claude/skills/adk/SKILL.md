---
name: anthropic-agent-sdk
description: Build AI agents using Anthropic's Agent SDK. Use when creating agents, handling tool calls, managing conversations, or building agentic workflows. Triggers on @anthropic-ai/sdk imports, Anthropic client usage, or agent architecture discussions. Complements the agent-sdk-dev plugin.
---

# Anthropic Agent SDK Guide

For scaffolding new projects, use `/new-sdk-app` from the agent-sdk-dev plugin.

## Quick Start

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const response = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

## Tool Use (Agentic Pattern)

```typescript
const tools = [
  {
    name: 'search',
    description: 'Search for information',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' }
      },
      required: ['query']
    }
  }
];

const response = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  tools,
  messages: [{ role: 'user', content: 'Search for AI training methods' }]
});

// Handle tool use
if (response.stop_reason === 'tool_use') {
  const toolUse = response.content.find(c => c.type === 'tool_use');
  // Execute tool and continue conversation
}
```

## Training Camp Agents

See [agents.md](agents.md) for project-specific implementations:
- Master Trainer (evolution algorithm)
- Lineage Executor (artifact generation)

## Streaming

```typescript
const stream = await client.messages.stream({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello!' }]
});

for await (const event of stream) {
  if (event.type === 'content_block_delta') {
    process.stdout.write(event.delta.text);
  }
}
```

## Resources

- [Anthropic SDK Docs](https://docs.anthropic.com/en/api/client-sdks)
- [Tool Use Guide](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)
