export const SCHEMA_VERSION = 8;

export const CREATE_TABLES_SQL = `
-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  need TEXT NOT NULL,
  constraints TEXT,
  input_prompt TEXT,
  mode TEXT NOT NULL DEFAULT 'training',
  promoted_from TEXT,
  initial_agent_count INTEGER NOT NULL DEFAULT 4,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Lineages
CREATE TABLE IF NOT EXISTS lineages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  label TEXT NOT NULL CHECK (label IN ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H')),
  strategy_tag TEXT,
  is_locked INTEGER DEFAULT 0,
  directive_sticky TEXT,
  directive_oneshot TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Artifacts
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  lineage_id TEXT NOT NULL,
  cycle INTEGER NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (lineage_id) REFERENCES lineages(id) ON DELETE CASCADE
);

-- Evaluations
CREATE TABLE IF NOT EXISTS evaluations (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 1 AND score <= 10),
  comment TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE
);

-- Audit Log
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  data TEXT,
  created_at INTEGER NOT NULL
);

-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY
);

-- Agent definitions (the actual agent configs)
CREATE TABLE IF NOT EXISTS agent_definitions (
  id TEXT PRIMARY KEY,
  lineage_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  tools TEXT NOT NULL,
  flow TEXT NOT NULL,
  memory_config TEXT NOT NULL,
  parameters TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (lineage_id) REFERENCES lineages(id) ON DELETE CASCADE
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
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Example pairs for few-shot learning
CREATE TABLE IF NOT EXISTS context_examples (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  input TEXT NOT NULL,
  expected_output TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Test cases (inputs to evaluate agents against)
CREATE TABLE IF NOT EXISTS test_cases (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  input TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Rollouts (cycles of agent execution)
CREATE TABLE IF NOT EXISTS rollouts (
  id TEXT PRIMARY KEY,
  lineage_id TEXT NOT NULL,
  cycle INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  final_attempt_id TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (lineage_id) REFERENCES lineages(id) ON DELETE CASCADE
);

-- Attempts (tries within a rollout)
CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  rollout_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed')),

  -- Reproducibility (agent snapshot)
  agent_id TEXT NOT NULL,
  agent_version INTEGER NOT NULL,
  system_prompt_hash TEXT NOT NULL,
  tools_hash TEXT NOT NULL,
  flow_hash TEXT NOT NULL,

  -- Execution context
  input TEXT NOT NULL,
  model_id TEXT NOT NULL,
  temperature REAL,
  max_tokens INTEGER,
  top_p REAL,

  -- Results
  output TEXT,
  error TEXT,

  -- Metrics
  duration_ms INTEGER,
  total_tokens INTEGER,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  estimated_cost REAL,

  created_at INTEGER NOT NULL,
  FOREIGN KEY (rollout_id) REFERENCES rollouts(id) ON DELETE CASCADE
);

-- Execution spans (detailed traces)
CREATE TABLE IF NOT EXISTS execution_spans (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  parent_span_id TEXT,
  sequence INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('llm_call', 'tool_call', 'tool_result', 'reasoning', 'output')),

  input TEXT,
  output TEXT,

  model_id TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,

  tool_name TEXT,
  tool_args TEXT,
  tool_result TEXT,
  tool_error TEXT,

  duration_ms INTEGER,
  estimated_cost REAL,

  created_at INTEGER NOT NULL,
  FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE
);

-- Evolution records (history of agent changes)
CREATE TABLE IF NOT EXISTS evolution_records (
  id TEXT PRIMARY KEY,
  lineage_id TEXT NOT NULL,
  from_version INTEGER NOT NULL,
  to_version INTEGER NOT NULL,

  rollout_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  trigger_score INTEGER,
  trigger_comment TEXT,
  trigger_directives TEXT,

  score_analysis TEXT NOT NULL,
  credit_assignment TEXT NOT NULL,
  plan TEXT NOT NULL,
  changes TEXT NOT NULL,

  next_score INTEGER,
  score_delta INTEGER,
  hypothesis_validated INTEGER,

  created_at INTEGER NOT NULL,
  FOREIGN KEY (lineage_id) REFERENCES lineages(id) ON DELETE CASCADE
);

-- Learning insights (patterns learned from evolution)
CREATE TABLE IF NOT EXISTS learning_insights (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  pattern TEXT NOT NULL,
  pattern_type TEXT NOT NULL CHECK (pattern_type IN ('prompt_change', 'tool_change', 'param_change')),
  contexts TEXT,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  avg_score_impact REAL,
  confidence REAL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Training events (immutable event log)
CREATE TABLE IF NOT EXISTS training_events (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,

  -- Entity references (sparse)
  session_id TEXT,
  lineage_id TEXT,
  agent_id TEXT,
  artifact_id TEXT,
  attempt_id TEXT,

  -- Content-addressed payload
  payload_hash TEXT NOT NULL,

  -- Denormalized tags for filtering
  tags TEXT,

  created_at INTEGER NOT NULL
);

-- Payload blobs (content-addressed storage)
CREATE TABLE IF NOT EXISTS payload_blobs (
  hash TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Materialized training examples
CREATE TABLE IF NOT EXISTS training_examples (
  id TEXT PRIMARY KEY,
  example_type TEXT NOT NULL CHECK (example_type IN ('sft', 'preference', 'reward')),

  -- Content references
  system_prompt_hash TEXT,
  user_input_hash TEXT,
  completion_hash TEXT,

  -- For preference pairs
  chosen_hash TEXT,
  rejected_hash TEXT,

  -- Metadata
  score REAL,
  score_delta REAL,
  source_event_ids TEXT,

  created_at INTEGER NOT NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_lineages_session ON lineages(session_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_lineage ON artifacts(lineage_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_cycle ON artifacts(lineage_id, cycle);
CREATE INDEX IF NOT EXISTS idx_evaluations_artifact ON evaluations(artifact_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_agent_definitions_lineage ON agent_definitions(lineage_id);
CREATE INDEX IF NOT EXISTS idx_context_documents_session ON context_documents(session_id);
CREATE INDEX IF NOT EXISTS idx_context_examples_session ON context_examples(session_id);
CREATE INDEX IF NOT EXISTS idx_test_cases_session ON test_cases(session_id);
CREATE INDEX IF NOT EXISTS idx_rollouts_lineage ON rollouts(lineage_id);
CREATE INDEX IF NOT EXISTS idx_rollouts_cycle ON rollouts(lineage_id, cycle);
CREATE INDEX IF NOT EXISTS idx_attempts_rollout ON attempts(rollout_id);
CREATE INDEX IF NOT EXISTS idx_execution_spans_attempt ON execution_spans(attempt_id);
CREATE INDEX IF NOT EXISTS idx_evolution_records_lineage ON evolution_records(lineage_id);
CREATE INDEX IF NOT EXISTS idx_learning_insights_session ON learning_insights(session_id);
CREATE INDEX IF NOT EXISTS idx_training_events_type ON training_events(event_type);
CREATE INDEX IF NOT EXISTS idx_training_events_session ON training_events(session_id);
CREATE INDEX IF NOT EXISTS idx_training_events_timestamp ON training_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_training_examples_type ON training_examples(example_type);
`;

// Migrations for upgrading schema versions
export const MIGRATIONS: {
  fromVersion: number;
  toVersion: number;
  sql: string;
}[] = [
  {
    fromVersion: 1,
    toVersion: 2,
    sql: `
-- Add new columns to artifacts table
ALTER TABLE artifacts ADD COLUMN agent_version INTEGER DEFAULT 1;
ALTER TABLE artifacts ADD COLUMN input TEXT;
ALTER TABLE artifacts ADD COLUMN tools_used TEXT;
ALTER TABLE artifacts ADD COLUMN tokens_used INTEGER;
ALTER TABLE artifacts ADD COLUMN latency_ms INTEGER;

-- Create new tables
CREATE TABLE IF NOT EXISTS agent_definitions (
  id TEXT PRIMARY KEY,
  lineage_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  tools TEXT NOT NULL,
  flow TEXT NOT NULL,
  memory_config TEXT NOT NULL,
  parameters TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (lineage_id) REFERENCES lineages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS context_documents (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS context_examples (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  input TEXT NOT NULL,
  expected_output TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS test_cases (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  input TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Create indexes for new tables
CREATE INDEX IF NOT EXISTS idx_agent_definitions_lineage ON agent_definitions(lineage_id);
CREATE INDEX IF NOT EXISTS idx_context_documents_session ON context_documents(session_id);
CREATE INDEX IF NOT EXISTS idx_context_examples_session ON context_examples(session_id);
CREATE INDEX IF NOT EXISTS idx_test_cases_session ON test_cases(session_id);
`,
  },
  {
    fromVersion: 2,
    toVersion: 3,
    sql: `
-- Rollouts (cycles of agent execution)
CREATE TABLE IF NOT EXISTS rollouts (
  id TEXT PRIMARY KEY,
  lineage_id TEXT NOT NULL,
  cycle INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  final_attempt_id TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (lineage_id) REFERENCES lineages(id) ON DELETE CASCADE
);

-- Attempts (tries within a rollout)
CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  rollout_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed')),

  -- Reproducibility (agent snapshot)
  agent_id TEXT NOT NULL,
  agent_version INTEGER NOT NULL,
  system_prompt_hash TEXT NOT NULL,
  tools_hash TEXT NOT NULL,
  flow_hash TEXT NOT NULL,

  -- Execution context
  input TEXT NOT NULL,
  model_id TEXT NOT NULL,
  temperature REAL,
  max_tokens INTEGER,
  top_p REAL,

  -- Results
  output TEXT,
  error TEXT,

  -- Metrics
  duration_ms INTEGER,
  total_tokens INTEGER,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  estimated_cost REAL,

  created_at INTEGER NOT NULL,
  FOREIGN KEY (rollout_id) REFERENCES rollouts(id) ON DELETE CASCADE
);

-- Execution spans (detailed traces)
CREATE TABLE IF NOT EXISTS execution_spans (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  parent_span_id TEXT,
  sequence INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('llm_call', 'tool_call', 'tool_result', 'reasoning', 'output')),

  input TEXT,
  output TEXT,

  model_id TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,

  tool_name TEXT,
  tool_args TEXT,
  tool_result TEXT,
  tool_error TEXT,

  duration_ms INTEGER,
  estimated_cost REAL,

  created_at INTEGER NOT NULL,
  FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE
);

-- Evolution records (history of agent changes)
CREATE TABLE IF NOT EXISTS evolution_records (
  id TEXT PRIMARY KEY,
  lineage_id TEXT NOT NULL,
  from_version INTEGER NOT NULL,
  to_version INTEGER NOT NULL,

  rollout_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  trigger_score INTEGER,
  trigger_comment TEXT,
  trigger_directives TEXT,

  score_analysis TEXT NOT NULL,
  credit_assignment TEXT NOT NULL,
  plan TEXT NOT NULL,
  changes TEXT NOT NULL,

  next_score INTEGER,
  score_delta INTEGER,
  hypothesis_validated INTEGER,

  created_at INTEGER NOT NULL,
  FOREIGN KEY (lineage_id) REFERENCES lineages(id) ON DELETE CASCADE
);

-- Learning insights (patterns learned from evolution)
CREATE TABLE IF NOT EXISTS learning_insights (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  pattern TEXT NOT NULL,
  pattern_type TEXT NOT NULL CHECK (pattern_type IN ('prompt_change', 'tool_change', 'param_change')),
  contexts TEXT,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  avg_score_impact REAL,
  confidence REAL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Create indexes for evolution tables
CREATE INDEX IF NOT EXISTS idx_rollouts_lineage ON rollouts(lineage_id);
CREATE INDEX IF NOT EXISTS idx_rollouts_cycle ON rollouts(lineage_id, cycle);
CREATE INDEX IF NOT EXISTS idx_attempts_rollout ON attempts(rollout_id);
CREATE INDEX IF NOT EXISTS idx_execution_spans_attempt ON execution_spans(attempt_id);
CREATE INDEX IF NOT EXISTS idx_evolution_records_lineage ON evolution_records(lineage_id);
CREATE INDEX IF NOT EXISTS idx_learning_insights_session ON learning_insights(session_id);
`,
  },
  {
    fromVersion: 3,
    toVersion: 4,
    sql: `
-- Training events (immutable event log)
CREATE TABLE IF NOT EXISTS training_events (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,

  -- Entity references (sparse)
  session_id TEXT,
  lineage_id TEXT,
  agent_id TEXT,
  artifact_id TEXT,
  attempt_id TEXT,

  -- Content-addressed payload
  payload_hash TEXT NOT NULL,

  -- Denormalized tags for filtering
  tags TEXT,

  created_at INTEGER NOT NULL
);

-- Payload blobs (content-addressed storage)
CREATE TABLE IF NOT EXISTS payload_blobs (
  hash TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Materialized training examples
CREATE TABLE IF NOT EXISTS training_examples (
  id TEXT PRIMARY KEY,
  example_type TEXT NOT NULL CHECK (example_type IN ('sft', 'preference', 'reward')),

  -- Content references
  system_prompt_hash TEXT,
  user_input_hash TEXT,
  completion_hash TEXT,

  -- For preference pairs
  chosen_hash TEXT,
  rejected_hash TEXT,

  -- Metadata
  score REAL,
  score_delta REAL,
  source_event_ids TEXT,

  created_at INTEGER NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_training_events_type ON training_events(event_type);
CREATE INDEX IF NOT EXISTS idx_training_events_session ON training_events(session_id);
CREATE INDEX IF NOT EXISTS idx_training_events_timestamp ON training_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_training_examples_type ON training_examples(example_type);
`,
  },
  {
    fromVersion: 4,
    toVersion: 5,
    sql: `
-- Add Quick Start mode support to sessions
ALTER TABLE sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'training';
ALTER TABLE sessions ADD COLUMN promoted_from TEXT;

-- Quick Start feedback table
CREATE TABLE IF NOT EXISTS quickstart_feedback (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL,
  feedback TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quickstart_feedback_artifact ON quickstart_feedback(artifact_id);
`,
  },
  {
    fromVersion: 5,
    toVersion: 6,
    sql: `
-- Add input_prompt field to sessions for explicit test inputs
ALTER TABLE sessions ADD COLUMN input_prompt TEXT;
`,
  },
  {
    fromVersion: 6,
    toVersion: 7,
    sql: `
-- Remove Quick Start feature entirely
-- Delete all quickstart sessions and their related data (cascades)
DELETE FROM sessions WHERE mode = 'quickstart';

-- Drop the quickstart_feedback table
DROP TABLE IF EXISTS quickstart_feedback;

-- Drop the index if it exists
DROP INDEX IF EXISTS idx_quickstart_feedback_artifact;
`,
  },
  {
    fromVersion: 7,
    toVersion: 8,
    sql: `
-- Add initial_agent_count to sessions for dynamic agent counts
ALTER TABLE sessions ADD COLUMN initial_agent_count INTEGER NOT NULL DEFAULT 4;
`,
  },
];
