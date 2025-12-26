# Plan: Context Management & Agent Infrastructure View

## Overview

Add two major features to Training Camp:

1. **Context Management** - Users can provide documents, examples, and data sources that agents use during training
2. **Agent Infrastructure View** - Users can inspect the full agent architecture (prompts, tools, flow, memory) behind each lineage output

These features transform Training Camp from "evaluate outputs" to "understand and train complete agent systems on real data."

---

## Current Architecture Reference

```
src/
├── components/
│   ├── cards/
│   │   ├── LineageCard.tsx      # Shows output + score
│   │   ├── CardGrid.tsx         # 2x2 grid layout
│   │   └── ExpandedCard.tsx     # Modal for full output view
│   └── panels/
│       ├── TrainerPanel.tsx     # Chat with master trainer
│       └── DirectivePanel.tsx   # Per-lineage directives
├── types/index.ts               # Type definitions
├── db/schema.ts                 # SQLite schema
├── agents/master-trainer.ts     # LLM-powered trainer
└── store/lineages.ts            # Lineage state management
```

---

## Feature 1: Context Management

### 1.1 Requirements

Users should be able to:
- Upload documents (txt, md, pdf, json)
- Add example input/output pairs
- Define data source connections (future: APIs)
- Attach context to a session
- See which context items are being used by agents

### 1.2 Database Schema Changes

Add to `src/db/schema.ts`:

```sql
-- Context items attached to a session
CREATE TABLE IF NOT EXISTS context_items (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL, -- 'document' | 'example' | 'data_source'
  name TEXT NOT NULL,
  content TEXT, -- For documents: file content; For examples: JSON
  metadata TEXT, -- JSON: {filename, mimeType, size, etc.}
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Example pairs for few-shot learning
CREATE TABLE IF NOT EXISTS examples (
  id TEXT PRIMARY KEY,
  context_item_id TEXT NOT NULL,
  input TEXT NOT NULL,
  output TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (context_item_id) REFERENCES context_items(id)
);
```

### 1.3 Type Definitions

Add to `src/types/index.ts`:

```typescript
export type ContextItemType = 'document' | 'example' | 'data_source';

export interface ContextItem {
  id: string;
  sessionId: string;
  type: ContextItemType;
  name: string;
  content: string | null;
  metadata: Record<string, unknown>;
  createdAt: number;
}

export interface ExamplePair {
  id: string;
  contextItemId: string;
  input: string;
  output: string;
  createdAt: number;
}

export interface SessionContext {
  documents: ContextItem[];
  examples: ContextItem[];
  dataSources: ContextItem[];
}
```

### 1.4 New Components

#### `src/components/context/ContextPanel.tsx`
- Main panel for managing session context
- Tabs: Documents | Examples | Data Sources
- Upload button, list of items, delete capability

#### `src/components/context/DocumentUploader.tsx`
- Drag-and-drop file upload
- Supports: .txt, .md, .json, .pdf (text extraction)
- Shows upload progress, file preview

#### `src/components/context/ExampleEditor.tsx`
- Form for adding input/output example pairs
- List of existing examples with edit/delete
- Import from JSON capability

#### `src/components/context/ContextItemCard.tsx`
- Displays a single context item
- Shows type icon, name, size, preview
- Delete button, expand to view full content

### 1.5 Store Changes

Create `src/store/context.ts`:

```typescript
interface ContextStore {
  items: ContextItem[];
  isLoading: boolean;

  // Actions
  loadContext: (sessionId: string) => Promise<void>;
  addDocument: (sessionId: string, file: File) => Promise<ContextItem>;
  addExample: (sessionId: string, input: string, output: string) => Promise<ContextItem>;
  removeItem: (itemId: string) => Promise<void>;
  getSessionContext: (sessionId: string) => SessionContext;
}
```

### 1.6 Integration with Agent

Update `src/agents/master-trainer.ts`:
- Accept context in `generateInitialLineages(need, constraints, context)`
- Include relevant context in prompts sent to LLM
- Reference documents and examples when generating outputs

### 1.7 Tests (TDD)

Create `e2e/context.spec.ts`:

```typescript
test.describe('Context Management', () => {
  test('can upload a document to session', async ({ page }) => {
    // Create session, upload file, verify it appears in list
  });

  test('can add example input/output pair', async ({ page }) => {
    // Create session, add example, verify it's saved
  });

  test('can delete a context item', async ({ page }) => {
    // Upload item, delete it, verify removed
  });

  test('context persists after page reload', async ({ page }) => {
    // Add context, reload, verify still there
  });

  test('context is used in lineage generation', async ({ page }) => {
    // Add specific context, generate lineages, verify output references it
  });
});
```

---

## Feature 2: Agent Infrastructure View

### 2.1 Requirements

Users should be able to:
- Click a lineage card to see its full agent configuration
- View as interactive flowchart or structured list
- See: system prompt, tools, flow steps, memory config, parameters
- Understand WHY outputs differ between lineages
- (Future) Edit infrastructure directly

### 2.2 Data Model

Add to `src/types/index.ts`:

```typescript
export interface AgentTool {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

export interface AgentFlowStep {
  id: string;
  type: 'prompt' | 'tool_call' | 'condition' | 'memory_read' | 'memory_write';
  name: string;
  config: Record<string, unknown>;
  next?: string | { true: string; false: string };
}

export interface AgentInfrastructure {
  systemPrompt: string;
  tools: AgentTool[];
  flow: AgentFlowStep[];
  memory: {
    type: 'conversation' | 'buffer' | 'summary' | 'vector';
    config: Record<string, unknown>;
  };
  parameters: {
    model: string;
    temperature: number;
    maxTokens: number;
    [key: string]: unknown;
  };
}

// Update Lineage type to include infrastructure
export interface Lineage {
  // ... existing fields
  infrastructure: AgentInfrastructure;
}
```

### 2.3 Database Schema Changes

Add to `src/db/schema.ts`:

```sql
-- Store agent infrastructure per lineage
ALTER TABLE lineages ADD COLUMN infrastructure TEXT; -- JSON blob
```

Or create separate table for normalized storage:

```sql
CREATE TABLE IF NOT EXISTS agent_infrastructure (
  id TEXT PRIMARY KEY,
  lineage_id TEXT NOT NULL UNIQUE,
  system_prompt TEXT NOT NULL,
  tools TEXT NOT NULL, -- JSON array
  flow TEXT NOT NULL, -- JSON array of steps
  memory_config TEXT NOT NULL, -- JSON
  parameters TEXT NOT NULL, -- JSON
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (lineage_id) REFERENCES lineages(id)
);
```

### 2.4 New Components

#### `src/components/infrastructure/InfrastructureView.tsx`
- Main container for viewing agent infrastructure
- Toggle between: Flowchart View | List View
- Collapsible sections for each component

#### `src/components/infrastructure/FlowchartView.tsx`
- Visual flowchart rendering of agent flow
- Nodes for each step, edges showing connections
- Click node to see details
- Use library: `reactflow` or custom SVG

#### `src/components/infrastructure/PromptViewer.tsx`
- Syntax-highlighted display of system prompt
- Show variable placeholders highlighted
- Copy button

#### `src/components/infrastructure/ToolsList.tsx`
- List of tools available to agent
- Each tool shows: name, description, parameters
- Icon for tool type (search, code, api, etc.)

#### `src/components/infrastructure/MemoryConfig.tsx`
- Shows memory type and configuration
- Visual representation of memory structure

#### `src/components/infrastructure/ParametersPanel.tsx`
- Model name, temperature, max tokens
- Other LLM parameters
- Visual sliders/indicators

### 2.5 UI Integration

Update `src/components/cards/ExpandedCard.tsx`:
- Add tab: "Output" | "Infrastructure"
- Infrastructure tab shows InfrastructureView component

Or create new component:
#### `src/components/cards/InfrastructureModal.tsx`
- Dedicated modal for infrastructure view
- Triggered by "View Agent" button on LineageCard

### 2.6 Master Trainer Updates

Update `src/agents/master-trainer.ts`:
- When generating lineages, also generate infrastructure specs
- Each strategy (Concise, Detailed, etc.) maps to different infrastructure
- Return infrastructure as part of lineage data

```typescript
interface GeneratedLineage {
  label: string;
  strategyTag: string;
  content: string;
  infrastructure: AgentInfrastructure;
}
```

### 2.7 Tests (TDD)

Create `e2e/infrastructure.spec.ts`:

```typescript
test.describe('Agent Infrastructure View', () => {
  test('can view infrastructure from expanded card', async ({ page }) => {
    // Create session, expand card, click Infrastructure tab
    // Verify system prompt visible
  });

  test('displays all agent tools', async ({ page }) => {
    // Create session, open infrastructure view
    // Verify tools list shows expected tools
  });

  test('shows flowchart of agent steps', async ({ page }) => {
    // Open infrastructure view, verify flow nodes visible
  });

  test('different lineages have different infrastructure', async ({ page }) => {
    // Create session, compare infrastructure of Lineage A vs B
    // Verify they have different prompts/tools
  });

  test('can copy system prompt', async ({ page }) => {
    // Open infrastructure, click copy on prompt
    // Verify clipboard contains prompt
  });
});
```

---

## Implementation Order

### Phase 1: Database & Types (Day 1)
1. Write tests for new database operations
2. Update `src/db/schema.ts` with new tables
3. Update `src/db/queries.ts` with CRUD operations
4. Update `src/types/index.ts` with new interfaces
5. Run migrations

### Phase 2: Context Management (Days 2-3)
1. Write e2e tests for context features
2. Create context store (`src/store/context.ts`)
3. Build `ContextPanel` component
4. Build `DocumentUploader` component
5. Build `ExampleEditor` component
6. Integrate context panel into Training page
7. Update master-trainer to use context
8. Verify all tests pass

### Phase 3: Agent Infrastructure View (Days 4-5)
1. Write e2e tests for infrastructure view
2. Update master-trainer to generate infrastructure specs
3. Build `InfrastructureView` component
4. Build `FlowchartView` component (or use reactflow)
5. Build `PromptViewer`, `ToolsList`, `MemoryConfig`, `ParametersPanel`
6. Integrate into ExpandedCard or create InfrastructureModal
7. Verify all tests pass

### Phase 4: Polish & Integration (Day 6)
1. Ensure context flows into infrastructure display
2. Add loading states and error handling
3. Responsive design for all new components
4. Final e2e test run
5. Update README with new features

---

## Dependencies to Add

```bash
pnpm add reactflow @reactflow/core @reactflow/controls @reactflow/background
pnpm add react-dropzone  # For file upload
pnpm add prismjs @types/prismjs  # For syntax highlighting (optional)
```

---

## File Checklist

### New Files to Create:
- [ ] `src/types/context.ts` (or add to index.ts)
- [ ] `src/types/infrastructure.ts` (or add to index.ts)
- [ ] `src/store/context.ts`
- [ ] `src/db/queries/context.ts`
- [ ] `src/components/context/ContextPanel.tsx`
- [ ] `src/components/context/DocumentUploader.tsx`
- [ ] `src/components/context/ExampleEditor.tsx`
- [ ] `src/components/context/ContextItemCard.tsx`
- [ ] `src/components/infrastructure/InfrastructureView.tsx`
- [ ] `src/components/infrastructure/FlowchartView.tsx`
- [ ] `src/components/infrastructure/PromptViewer.tsx`
- [ ] `src/components/infrastructure/ToolsList.tsx`
- [ ] `src/components/infrastructure/MemoryConfig.tsx`
- [ ] `src/components/infrastructure/ParametersPanel.tsx`
- [ ] `e2e/context.spec.ts`
- [ ] `e2e/infrastructure.spec.ts`

### Files to Modify:
- [ ] `src/db/schema.ts` - Add new tables
- [ ] `src/db/queries.ts` - Add context & infrastructure queries
- [ ] `src/types/index.ts` - Add new type definitions
- [ ] `src/agents/master-trainer.ts` - Generate infrastructure, use context
- [ ] `src/pages/Training.tsx` - Add context panel
- [ ] `src/components/cards/ExpandedCard.tsx` - Add infrastructure tab
- [ ] `src/components/cards/LineageCard.tsx` - Add "View Agent" button
- [ ] `src/store/lineages.ts` - Handle infrastructure data

---

## Success Criteria

1. **Context Management**
   - [ ] User can upload documents to a session
   - [ ] User can add input/output example pairs
   - [ ] Context persists in database
   - [ ] Lineage generation uses provided context
   - [ ] All context e2e tests pass

2. **Agent Infrastructure View**
   - [ ] User can view system prompt for any lineage
   - [ ] User can see list of tools available to agent
   - [ ] User can see agent flow as visual diagram
   - [ ] User can see memory and parameter configuration
   - [ ] Different lineages show different infrastructure
   - [ ] All infrastructure e2e tests pass

3. **Integration**
   - [ ] `pnpm build` succeeds
   - [ ] All 12+ existing tests still pass
   - [ ] All new tests pass
   - [ ] No TypeScript errors

---

## Notes for Implementation

1. **Start with tests** - Write failing e2e tests first, then implement to make them pass
2. **Database migrations** - Be careful with schema changes; test migration path
3. **Reactflow** - Consider if complexity is worth it; simple SVG might suffice initially
4. **Context size limits** - Consider max file size, total context size for LLM token limits
5. **Infrastructure generation** - Start with static templates per strategy, evolve to LLM-generated
