---
name: anthropic-agent-sdk
description: Build AI agents using Anthropic's Agent SDK. Use when creating agents, handling tool calls, managing conversations, or building agentic workflows. Triggers on @anthropic-ai/sdk imports, Anthropic client usage, or agent architecture discussions. Complements the agent-sdk-dev plugin.
---

# Anthropic Agent SDK Guide

> **IMPORTANT**: This SDK is used ONLY for exported standalone code.
> Training Camp runtime uses LiteLLM gateway (`src/api/llm.ts`), NOT Anthropic SDK directly.
> This guide is for generating standalone agent code that users export and run independently.

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

## Training Camp Architecture

Training Camp uses two LLM integration patterns:

1. **Runtime (LiteLLM)**: All agent execution within Training Camp goes through `src/api/llm.ts`
   - Multi-model support via LiteLLM gateway
   - OpenAI-compatible API format

2. **Export (Anthropic SDK)**: Generated standalone code in `src/lib/export/to-typescript.ts`
   - Users can export agents to run independently
   - Requires user's own `ANTHROPIC_API_KEY`

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
