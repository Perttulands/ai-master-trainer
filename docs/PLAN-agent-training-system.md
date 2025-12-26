# Plan: Transform Training Camp into a Real Agent Training System

## Critical Context: Current State

### What Exists Now (BROKEN)

The current implementation **does NOT train agents**. It only generates text outputs:

```typescript
// master-trainer.ts - Current implementation
const STRATEGIES = {
  A: { tag: 'Concise', description: 'Brief, focused...' },
  B: { tag: 'Detailed', description: 'Comprehensive...' },
  // etc.
};

// Returns ONLY text content - no agent definition
return {
  label,
  strategyTag: strategy.tag,
  content: content.trim(),  // Just a string!
};
```

**Problems:**
1. No agent configuration exists - just text with style labels
2. No tools, flows, memory, or parameters are defined
3. Nothing is stored as files - everything is ephemeral
4. Export button does nothing (no onClick handler)
5. Users cannot see "the agent" because there IS no agent

### What We Need to Build

Transform each lineage from "text output" to "complete agent definition":

```typescript
// What a lineage SHOULD contain
interface AgentLineage {
  id: string;
  label: 'A' | 'B' | 'C' | 'D';
  strategyTag: string;

  // THE ACTUAL AGENT DEFINITION
  agent: {
    name: string;
    description: string;
    systemPrompt: string;
    tools: AgentTool[];
    flow: AgentFlowStep[];
    memory: MemoryConfig;
    parameters: ModelParameters;
  };

  // Output is now PRODUCED BY the agent, not the lineage itself
  outputs: AgentOutput[];
}
```

---

## Goals

1. **Real Agents** - Each lineage IS a complete agent definition
2. **File-Based Storage** - Agents stored as readable JSON/YAML files
3. **Visual Infrastructure** - Flowcharts showing agent architecture
4. **Context Integration** - Users provide real data for training
5. **Working Export** - Export selected agents as deployable code

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      TRAINING SESSION                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  USER CONTEXT (provided by user)                                │
│  ├── Documents: [files user uploads]                           │
│  ├── Examples: [{input, expectedOutput}]                       │
│  └── Test Cases: [inputs to run against all lineages]          │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  4 AGENT LINEAGES (each is a complete agent)                   │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐                      │
│  │ LINEAGE A       │  │ LINEAGE B       │                      │
│  │ ─────────────── │  │ ─────────────── │                      │
│  │ Agent Config:   │  │ Agent Config:   │                      │
│  │ • System Prompt │  │ • System Prompt │                      │
│  │ • Tools: [2]    │  │ • Tools: [4]    │                      │
│  │ • Flow: 3 steps │  │ • Flow: 5 steps │                      │
│  │ • Memory: buffer│  │ • Memory: vector│                      │
│  │                 │  │                 │                      │
│  │ Output: "..."   │  │ Output: "..."   │                      │
│  │ Score: 7/10     │  │ Score: 8/10     │                      │
│  └─────────────────┘  └─────────────────┘                      │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐                      │
│  │ LINEAGE C       │  │ LINEAGE D       │                      │
│  │ ...             │  │ ...             │                      │
│  └─────────────────┘  └─────────────────┘                      │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  EXPORT: User selects winning agents → Downloads as:           │
│  • JSON config files                                            │
│  • Python code (LangChain/CrewAI compatible)                   │
│  • TypeScript code (Anthropic SDK compatible)                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Models

### Core Agent Definition

```typescript
// src/types/agent.ts

export interface AgentTool {
  id: string;
  name: string;
  description: string;
  type: 'builtin' | 'api' | 'function';
  config: {
    // For API tools
    endpoint?: string;
    method?: string;
    headers?: Record<string, string>;
    // For function tools
    code?: string;
    // For builtin tools
    builtinName?: string;
  };
  parameters: {
    name: string;
    type: string;
    description: string;
    required: boolean;
  }[];
}

export interface AgentFlowStep {
  id: string;
  type: 'start' | 'prompt' | 'tool' | 'condition' | 'loop' | 'output';
  name: string;
  config: Record<string, unknown>;
  position: { x: number; y: number }; // For flowchart rendering
  connections: {
    next?: string;
    onTrue?: string;
    onFalse?: string;
    onError?: string;
  };
}

export interface AgentMemoryConfig {
  type: 'none' | 'buffer' | 'summary' | 'vector';
  config: {
    maxTokens?: number;
    maxMessages?: number;
    embeddingModel?: string;
  };
}

export interface AgentParameters {
  model: string;
  temperature: number;
  maxTokens: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  version: number;

  // Core components
  systemPrompt: string;
  tools: AgentTool[];
  flow: AgentFlowStep[];
  memory: AgentMemoryConfig;
  parameters: AgentParameters;

  // Metadata
  createdAt: number;
  updatedAt: number;
}

// Updated Lineage type
export interface Lineage {
  id: string;
  sessionId: string;
  label: 'A' | 'B' | 'C' | 'D';
  strategyTag: string;
  isLocked: boolean;

  // THE AGENT
  agent: AgentDefinition;

  // Directives for evolution
  directiveSticky: string | null;
  directiveOneshot: string | null;

  createdAt: number;
}

// Artifact is now an output FROM the agent
export interface Artifact {
  id: string;
  lineageId: string;
  agentVersion: number; // Which version of agent produced this
  cycle: number;
  input: string; // The test input
  output: string; // What the agent produced
  metadata: {
    toolsUsed: string[];
    tokensUsed: number;
    latencyMs: number;
  };
  createdAt: number;
}
```

### Context for Training

```typescript
// src/types/context.ts

export interface ContextDocument {
  id: string;
  sessionId: string;
  name: string;
  content: string;
  mimeType: string;
  size: number;
  createdAt: number;
}

export interface ContextExample {
  id: string;
  sessionId: string;
  name: string;
  input: string;
  expectedOutput: string;
  createdAt: number;
}

export interface TestCase {
  id: string;
  sessionId: string;
  name: string;
  input: string;
  // No expected output - user evaluates the result
  createdAt: number;
}

export interface SessionContext {
  documents: ContextDocument[];
  examples: ContextExample[];
  testCases: TestCase[];
}
```

---

## Database Schema

```sql
-- src/db/schema.ts additions

-- Agent definitions (the actual agent configs)
CREATE TABLE IF NOT EXISTS agent_definitions (
  id TEXT PRIMARY KEY,
  lineage_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  tools TEXT NOT NULL, -- JSON array of AgentTool
  flow TEXT NOT NULL, -- JSON array of AgentFlowStep
  memory_config TEXT NOT NULL, -- JSON AgentMemoryConfig
  parameters TEXT NOT NULL, -- JSON AgentParameters
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (lineage_id) REFERENCES lineages(id)
);

-- Context documents
CREATE TABLE IF NOT EXISTS context_documents (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Example pairs for few-shot learning
CREATE TABLE IF NOT EXISTS context_examples (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  input TEXT NOT NULL,
  expected_output TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Test cases (inputs to evaluate agents against)
CREATE TABLE IF NOT EXISTS test_cases (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  input TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Update artifacts table to track agent version
ALTER TABLE artifacts ADD COLUMN agent_version INTEGER DEFAULT 1;
ALTER TABLE artifacts ADD COLUMN input TEXT;
ALTER TABLE artifacts ADD COLUMN tools_used TEXT; -- JSON array
ALTER TABLE artifacts ADD COLUMN tokens_used INTEGER;
ALTER TABLE artifacts ADD COLUMN latency_ms INTEGER;
```

---

## File Structure for New Components

```
src/
├── types/
│   ├── index.ts           # Re-export all types
│   ├── agent.ts           # AgentDefinition, AgentTool, etc.
│   └── context.ts         # ContextDocument, TestCase, etc.
│
├── components/
│   ├── agent/
│   │   ├── AgentCard.tsx           # Shows agent summary in lineage card
│   │   ├── AgentEditor.tsx         # Edit agent definition (future)
│   │   ├── AgentViewer.tsx         # Read-only view of full agent
│   │   └── AgentExporter.tsx       # Export dialog with format options
│   │
│   ├── infrastructure/
│   │   ├── FlowchartView.tsx       # Visual flowchart of agent
│   │   ├── FlowNode.tsx            # Single node in flowchart
│   │   ├── FlowEdge.tsx            # Connection between nodes
│   │   ├── PromptViewer.tsx        # Syntax-highlighted prompt
│   │   ├── ToolsPanel.tsx          # List of agent tools
│   │   ├── MemoryPanel.tsx         # Memory configuration
│   │   └── ParametersPanel.tsx     # Model parameters
│   │
│   ├── context/
│   │   ├── ContextPanel.tsx        # Main context management panel
│   │   ├── DocumentUploader.tsx    # Upload documents
│   │   ├── ExampleEditor.tsx       # Add/edit examples
│   │   ├── TestCaseEditor.tsx      # Add/edit test cases
│   │   └── ContextItemCard.tsx     # Display single context item
│   │
│   └── export/
│       ├── ExportModal.tsx         # Main export dialog
│       ├── AgentSelector.tsx       # Select which agents to export
│       ├── FormatSelector.tsx      # Choose export format
│       └── ExportPreview.tsx       # Preview export before download
│
├── services/
│   ├── agent-generator.ts          # Generate agent definitions
│   ├── agent-executor.ts           # Run agent against test input
│   ├── agent-evolver.ts            # Evolve agent based on feedback
│   └── agent-exporter.ts           # Export to various formats
│
├── store/
│   ├── agents.ts                   # Agent definitions state
│   └── context.ts                  # Context state
│
└── lib/
    ├── export/
    │   ├── to-json.ts              # Export as JSON config
    │   ├── to-python.ts            # Export as Python/LangChain
    │   ├── to-typescript.ts        # Export as TypeScript/Anthropic SDK
    │   └── to-yaml.ts              # Export as YAML config
    │
    └── templates/
        ├── agent-templates.ts      # Starter templates for strategies
        └── flow-templates.ts       # Common flow patterns
```

---

## Implementation Phases

### Phase 1: Agent Data Model (Day 1)

**Goal**: Define what an agent IS and store it properly.

**Tests to write first** (`e2e/agent-model.spec.ts`):
```typescript
test('lineage contains full agent definition', async ({ page }) => {
  // Create session, verify agent definition exists in lineage
});

test('agent definition has all required fields', async ({ page }) => {
  // Verify: systemPrompt, tools, flow, memory, parameters
});

test('agent definition persists after reload', async ({ page }) => {
  // Create session, reload, verify agent still there
});
```

**Implementation**:
1. Create `src/types/agent.ts` with all type definitions
2. Update database schema with `agent_definitions` table
3. Update `src/db/queries.ts` with agent CRUD operations
4. Create agent templates for each strategy (A/B/C/D)

### Phase 2: Agent Generation (Day 2)

**Goal**: Master Trainer generates real agent definitions, not just text.

**Tests to write first** (`e2e/agent-generation.spec.ts`):
```typescript
test('new session creates 4 different agent definitions', async ({ page }) => {
  // Create session, verify 4 unique agent configs
});

test('each lineage has different tools/flow', async ({ page }) => {
  // Verify lineages aren't identical
});

test('agent generates output from test input', async ({ page }) => {
  // Provide input, verify agent produces output
});
```

**Implementation**:
1. Rewrite `src/agents/master-trainer.ts` → `src/services/agent-generator.ts`
2. Create strategy templates with different tool sets and flows
3. Create `src/services/agent-executor.ts` to run agents
4. Update lineage creation to include agent definition

### Phase 3: Infrastructure View (Days 3-4)

**Goal**: Users can see the complete agent architecture.

**Tests to write first** (`e2e/infrastructure-view.spec.ts`):
```typescript
test('can view system prompt for lineage', async ({ page }) => {
  // Open lineage, verify prompt visible
});

test('can view agent tools list', async ({ page }) => {
  // Open lineage, verify tools displayed
});

test('can view agent flow as diagram', async ({ page }) => {
  // Open lineage, verify flowchart renders
});

test('can view memory and parameters', async ({ page }) => {
  // Open lineage, verify config visible
});

test('different lineages show different infrastructure', async ({ page }) => {
  // Compare A vs B, verify different configs
});
```

**Implementation**:
1. Install reactflow: `pnpm add reactflow`
2. Create `FlowchartView.tsx` component
3. Create `PromptViewer.tsx` with syntax highlighting
4. Create `ToolsPanel.tsx`, `MemoryPanel.tsx`, `ParametersPanel.tsx`
5. Create `AgentViewer.tsx` that combines all panels
6. Add "View Agent" button to `LineageCard.tsx`
7. Create modal or tab to show `AgentViewer`

### Phase 4: Context Management (Day 5)

**Goal**: Users provide real data for training.

**Tests to write first** (`e2e/context.spec.ts`):
```typescript
test('can upload document to session', async ({ page }) => {
  // Upload file, verify appears in list
});

test('can add example input/output pair', async ({ page }) => {
  // Add example, verify saved
});

test('can add test case', async ({ page }) => {
  // Add test input, verify saved
});

test('agent uses context in generation', async ({ page }) => {
  // Add context, generate, verify context used
});

test('test cases run against all lineages', async ({ page }) => {
  // Add test case, verify all 4 lineages produce output
});
```

**Implementation**:
1. Create database tables for context
2. Create `src/store/context.ts`
3. Build `ContextPanel.tsx` with tabs
4. Build `DocumentUploader.tsx` with drag-drop
5. Build `ExampleEditor.tsx` and `TestCaseEditor.tsx`
6. Integrate context into agent executor

### Phase 5: Agent Evolution (Day 6)

**Goal**: Evolution modifies the agent definition, not just output.

**Tests to write first** (`e2e/agent-evolution.spec.ts`):
```typescript
test('low score triggers significant agent changes', async ({ page }) => {
  // Score 2/10, regenerate, verify agent config changed
});

test('high score triggers minor refinements', async ({ page }) => {
  // Score 9/10, regenerate, verify agent mostly same
});

test('directive affects agent evolution', async ({ page }) => {
  // Add directive "use more examples", verify agent updated
});

test('agent version increments on evolution', async ({ page }) => {
  // Evolve, verify version number increased
});
```

**Implementation**:
1. Create `src/services/agent-evolver.ts`
2. Evolution modifies: prompt, tool selection, flow, parameters
3. Track agent versions in database
4. Show version history in UI

### Phase 6: Export System (Day 7)

**Goal**: Export selected agents as usable code/config.

**Tests to write first** (`e2e/export.spec.ts`):
```typescript
test('export button opens export modal', async ({ page }) => {
  // Click export, verify modal opens
});

test('can select which agents to export', async ({ page }) => {
  // Lock 2 agents, verify they appear in export selection
});

test('can export as JSON config', async ({ page }) => {
  // Select JSON, download, verify valid JSON
});

test('can export as Python code', async ({ page }) => {
  // Select Python, download, verify valid Python
});

test('can export as TypeScript code', async ({ page }) => {
  // Select TypeScript, download, verify valid TS
});

test('exported agent includes all components', async ({ page }) => {
  // Export, verify: prompt, tools, flow, memory, params
});
```

**Implementation**:
1. Create `ExportModal.tsx` with agent selection
2. Create export functions in `src/lib/export/`
3. Wire up Export button in Header
4. Generate downloadable files
5. Preview before download

---

## Export Format Examples

### JSON Export
```json
{
  "name": "Email Summarizer - Concise",
  "version": 3,
  "description": "Summarizes emails concisely with action items",
  "systemPrompt": "You are a concise email summarizer...",
  "tools": [
    {
      "name": "extract_action_items",
      "description": "Extract action items from text",
      "parameters": [...]
    }
  ],
  "flow": [
    { "id": "1", "type": "start", "connections": { "next": "2" } },
    { "id": "2", "type": "prompt", "config": { "template": "..." }, "connections": { "next": "3" } },
    { "id": "3", "type": "tool", "config": { "toolName": "extract_action_items" }, "connections": { "next": "4" } },
    { "id": "4", "type": "output" }
  ],
  "memory": { "type": "buffer", "config": { "maxMessages": 10 } },
  "parameters": { "model": "gpt-4", "temperature": 0.3, "maxTokens": 500 }
}
```

### Python Export (LangChain)
```python
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain.tools import tool
from langchain_openai import ChatOpenAI

# Email Summarizer - Concise (v3)
# Generated by Training Camp

SYSTEM_PROMPT = """You are a concise email summarizer..."""

@tool
def extract_action_items(text: str) -> list[str]:
    """Extract action items from text"""
    # Implementation here
    pass

def create_agent():
    llm = ChatOpenAI(model="gpt-4", temperature=0.3, max_tokens=500)
    tools = [extract_action_items]
    agent = create_tool_calling_agent(llm, tools, SYSTEM_PROMPT)
    return AgentExecutor(agent=agent, tools=tools)

if __name__ == "__main__":
    agent = create_agent()
    result = agent.invoke({"input": "Your email here..."})
    print(result)
```

### TypeScript Export (Anthropic SDK)
```typescript
import Anthropic from '@anthropic-ai/sdk';

// Email Summarizer - Concise (v3)
// Generated by Training Camp

const SYSTEM_PROMPT = `You are a concise email summarizer...`;

const tools: Anthropic.Tool[] = [
  {
    name: 'extract_action_items',
    description: 'Extract action items from text',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text to extract from' }
      },
      required: ['text']
    }
  }
];

export async function runAgent(input: string): Promise<string> {
  const client = new Anthropic();

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    tools,
    messages: [{ role: 'user', content: input }]
  });

  // Handle tool calls in agentic loop...
  return processResponse(response);
}
```

---

## Dependencies to Add

```bash
pnpm add reactflow @reactflow/core @reactflow/controls @reactflow/background
pnpm add react-dropzone
pnpm add file-saver @types/file-saver
pnpm add prism-react-renderer
```

---

## Success Criteria

### Must Have
- [ ] Each lineage contains a complete agent definition (not just text)
- [ ] Agent definitions stored in database with versioning
- [ ] Users can view system prompt, tools, flow, memory, parameters
- [ ] Flowchart visualization of agent architecture
- [ ] Export button works - downloads usable agent code
- [ ] At least JSON and Python export formats

### Should Have
- [ ] Context upload (documents, examples)
- [ ] Test cases that run against all lineages
- [ ] TypeScript export format
- [ ] Agent version history view

### Nice to Have
- [ ] Edit agent definition directly (not just through evolution)
- [ ] Import existing agent to continue training
- [ ] YAML export format
- [ ] CrewAI export format

---

## Migration Path

Since we're fundamentally changing what a "lineage" is, we need a migration:

1. **Database migration**: Add new tables, don't drop existing
2. **Existing sessions**: Mark as "legacy" or auto-migrate with default agent templates
3. **Gradual rollout**: Feature flag for new agent system

---

## File Checklist

### New Files
- [ ] `src/types/agent.ts`
- [ ] `src/types/context.ts`
- [ ] `src/services/agent-generator.ts`
- [ ] `src/services/agent-executor.ts`
- [ ] `src/services/agent-evolver.ts`
- [ ] `src/services/agent-exporter.ts`
- [ ] `src/store/agents.ts`
- [ ] `src/store/context.ts`
- [ ] `src/components/agent/AgentViewer.tsx`
- [ ] `src/components/infrastructure/FlowchartView.tsx`
- [ ] `src/components/infrastructure/PromptViewer.tsx`
- [ ] `src/components/infrastructure/ToolsPanel.tsx`
- [ ] `src/components/infrastructure/MemoryPanel.tsx`
- [ ] `src/components/infrastructure/ParametersPanel.tsx`
- [ ] `src/components/context/ContextPanel.tsx`
- [ ] `src/components/context/DocumentUploader.tsx`
- [ ] `src/components/context/ExampleEditor.tsx`
- [ ] `src/components/export/ExportModal.tsx`
- [ ] `src/lib/export/to-json.ts`
- [ ] `src/lib/export/to-python.ts`
- [ ] `src/lib/export/to-typescript.ts`
- [ ] `src/lib/templates/agent-templates.ts`
- [ ] `e2e/agent-model.spec.ts`
- [ ] `e2e/agent-generation.spec.ts`
- [ ] `e2e/infrastructure-view.spec.ts`
- [ ] `e2e/context.spec.ts`
- [ ] `e2e/agent-evolution.spec.ts`
- [ ] `e2e/export.spec.ts`

### Files to Modify
- [ ] `src/db/schema.ts` - Add agent tables
- [ ] `src/db/queries.ts` - Add agent queries
- [ ] `src/types/index.ts` - Re-export new types
- [ ] `src/components/cards/LineageCard.tsx` - Show agent summary, add "View Agent"
- [ ] `src/components/cards/ExpandedCard.tsx` - Add infrastructure tab
- [ ] `src/components/layout/Header.tsx` - Wire up Export button
- [ ] `src/pages/Training.tsx` - Add context panel
- [ ] `src/store/lineages.ts` - Handle agent definitions

### Files to Delete/Replace
- [ ] `src/agents/master-trainer.ts` → Replace with `src/services/agent-generator.ts`
- [ ] `src/agents/mock-trainer.ts` → No longer needed

---

## Notes for Implementation

1. **Start with agent data model** - Everything depends on this being right
2. **Use TDD strictly** - Write failing tests first, then implement
3. **Agent templates first** - Start with hardcoded templates per strategy, then make LLM generate them
4. **Simple flowchart first** - Don't over-engineer; SVG boxes and arrows work fine initially
5. **Export is the proof** - If you can export a working agent, the system works
