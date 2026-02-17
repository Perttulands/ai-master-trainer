import type { Session, LineageWithArtifact } from "../types";
import type { AgentDefinition, AgentMemoryConfig } from "../types/agent";

interface BackendResponseError {
  detail?: string;
  message?: string;
}

interface BackendStrategyInput {
  label: string;
  name: string;
  description: string;
  style: string;
  temperature?: number;
}

export interface CreateBackendSessionInput {
  name: string;
  need: string;
  constraints?: string;
  inputPrompt?: string;
  initialAgentCount?: number;
  strategies?: BackendStrategyInput[];
}

export interface OrchestrationSnapshot {
  session: Session;
  lineages: LineageWithArtifact[];
  agentsByLineage: Map<string, AgentDefinition>;
}

interface RawBackendAgent {
  id: string;
  name?: string;
  description?: string;
  version?: number;
  systemPrompt?: string;
  tools?: AgentDefinition["tools"];
  flow?: AgentDefinition["flow"];
  memory?: AgentMemoryConfig;
  parameters?: Partial<AgentDefinition["parameters"]>;
  createdAt?: number;
  updatedAt?: number;
}

interface RawBackendArtifact {
  id: string;
  lineageId: string;
  cycle: number;
  content: string;
  metadata?: Record<string, unknown> | null;
  createdAt: number;
}

interface RawBackendEvaluation {
  id: string;
  artifactId: string;
  score: number;
  comment?: string | null;
  createdAt: number;
}

interface RawBackendLineage {
  id: string;
  sessionId: string;
  label: LineageWithArtifact["label"];
  strategyTag?: string | null;
  isLocked: boolean;
  directiveSticky?: string[] | null;
  directiveOneshot?: string[] | null;
  createdAt: number;
  cycle?: number;
  currentAgent?: RawBackendAgent | null;
  currentArtifact?: RawBackendArtifact | null;
  currentEvaluation?: RawBackendEvaluation | null;
}

interface RawBackendSnapshot {
  session: {
    id: string;
    name: string;
    need: string;
    constraints?: string | null;
    inputPrompt?: string | null;
    initialAgentCount?: number;
    trainerMessages?: Session["trainerMessages"];
    createdAt: number;
    updatedAt: number;
  };
  lineages: RawBackendLineage[];
  regeneratedLabels?: string[];
}

function getOrchestrationBaseUrl(): string {
  return (
    import.meta.env.VITE_ORCHESTRATION_API_BASE ||
    import.meta.env.VITE_ADK_RUNTIME_BASE ||
    "http://localhost:8000"
  );
}

function getErrorMessage(payload: unknown, fallback: string): string {
  const err = payload as BackendResponseError | undefined;
  return err?.detail || err?.message || fallback;
}

async function requestJson<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${getOrchestrationBaseUrl()}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let errPayload: unknown = null;
    try {
      errPayload = await response.json();
    } catch {
      // Ignore parse failures
    }
    throw new Error(getErrorMessage(errPayload, `Backend request failed: ${response.status}`));
  }

  return (await response.json()) as T;
}

function normalizeMemory(memory?: AgentMemoryConfig): AgentMemoryConfig {
  if (memory) return memory;
  return {
    type: "buffer",
    config: {
      maxMessages: 10,
      maxTokens: 4000,
    },
  };
}

function toAgent(raw: RawBackendAgent, lineageId: string): AgentDefinition {
  return {
    id: raw.id,
    lineageId,
    name: raw.name || "Agent",
    description: raw.description || "",
    version: raw.version || 1,
    systemPrompt: raw.systemPrompt || "",
    tools: raw.tools || [],
    flow: raw.flow || [],
    memory: normalizeMemory(raw.memory),
    parameters: {
      model: raw.parameters?.model || import.meta.env.VITE_LITELLM_MODEL || "anthropic/claude-4-5-sonnet-aws",
      temperature: raw.parameters?.temperature ?? 0.7,
      maxTokens: raw.parameters?.maxTokens ?? 2048,
      topP: raw.parameters?.topP ?? 0.95,
      frequencyPenalty: raw.parameters?.frequencyPenalty,
      presencePenalty: raw.parameters?.presencePenalty,
    },
    createdAt: raw.createdAt || Date.now(),
    updatedAt: raw.updatedAt || Date.now(),
  };
}

function toSnapshot(raw: RawBackendSnapshot): OrchestrationSnapshot {
  const session: Session = {
    id: raw.session.id,
    name: raw.session.name,
    need: raw.session.need,
    constraints: raw.session.constraints ?? null,
    inputPrompt: raw.session.inputPrompt ?? null,
    initialAgentCount: raw.session.initialAgentCount ?? 4,
    trainerMessages: raw.session.trainerMessages ?? [],
    createdAt: raw.session.createdAt,
    updatedAt: raw.session.updatedAt,
  };

  const agentsByLineage = new Map<string, AgentDefinition>();
  const lineages: LineageWithArtifact[] = (raw.lineages || []).map((lineageRaw) => {
    const currentArtifact = lineageRaw.currentArtifact
      ? {
          id: lineageRaw.currentArtifact.id,
          lineageId: lineageRaw.currentArtifact.lineageId,
          cycle: lineageRaw.currentArtifact.cycle,
          content: lineageRaw.currentArtifact.content,
          metadata: lineageRaw.currentArtifact.metadata ?? null,
          createdAt: lineageRaw.currentArtifact.createdAt,
        }
      : null;

    const currentEvaluation = lineageRaw.currentEvaluation
      ? {
          id: lineageRaw.currentEvaluation.id,
          artifactId: lineageRaw.currentEvaluation.artifactId,
          score: lineageRaw.currentEvaluation.score,
          comment: lineageRaw.currentEvaluation.comment ?? null,
          createdAt: lineageRaw.currentEvaluation.createdAt,
        }
      : null;

    if (lineageRaw.currentAgent) {
      agentsByLineage.set(
        lineageRaw.id,
        toAgent(lineageRaw.currentAgent, lineageRaw.id)
      );
    }

    return {
      id: lineageRaw.id,
      sessionId: lineageRaw.sessionId,
      label: lineageRaw.label,
      strategyTag: lineageRaw.strategyTag ?? null,
      isLocked: Boolean(lineageRaw.isLocked),
      directiveSticky: lineageRaw.directiveSticky ?? null,
      directiveOneshot: lineageRaw.directiveOneshot ?? null,
      createdAt: lineageRaw.createdAt,
      cycle: lineageRaw.cycle ?? currentArtifact?.cycle ?? 0,
      currentArtifact,
      currentEvaluation,
    };
  });

  return { session, lineages, agentsByLineage };
}

export function isBackendOrchestrationEnabled(): boolean {
  return import.meta.env.VITE_ORCHESTRATION_MODE?.toLowerCase() === "backend";
}

export async function listBackendSessions(): Promise<Session[]> {
  const data = await requestJson<{ sessions: RawBackendSnapshot["session"][] }>("/api/sessions");
  return data.sessions.map((s) => ({
    id: s.id,
    name: s.name,
    need: s.need,
    constraints: s.constraints ?? null,
    inputPrompt: s.inputPrompt ?? null,
    initialAgentCount: s.initialAgentCount ?? 4,
    trainerMessages: [],
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }));
}

export async function getBackendSessionSnapshot(
  sessionId: string
): Promise<OrchestrationSnapshot> {
  const raw = await requestJson<RawBackendSnapshot>(`/api/sessions/${sessionId}`);
  return toSnapshot(raw);
}

export async function createBackendSession(
  input: CreateBackendSessionInput
): Promise<OrchestrationSnapshot> {
  const raw = await requestJson<RawBackendSnapshot>("/api/sessions", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return toSnapshot(raw);
}

export async function runBackendLineage(
  sessionId: string,
  lineageLabel: string,
  input: string
): Promise<void> {
  await requestJson(`/api/sessions/${sessionId}/run`, {
    method: "POST",
    body: JSON.stringify({ lineageLabel, input }),
  });
}

export async function evaluateBackendArtifact(
  artifactId: string,
  score: number,
  comment?: string
): Promise<void> {
  await requestJson(`/api/artifacts/${artifactId}/evaluate`, {
    method: "POST",
    body: JSON.stringify({ score, comment }),
  });
}

export async function iterateBackendSession(
  sessionId: string
): Promise<{ snapshot: OrchestrationSnapshot; regeneratedLabels: string[] }> {
  const raw = await requestJson<RawBackendSnapshot>(`/api/sessions/${sessionId}/iterate`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  const snapshot = toSnapshot(raw);
  return {
    snapshot,
    regeneratedLabels: raw.regeneratedLabels || [],
  };
}

export async function setBackendLineageLock(
  sessionId: string,
  label: string,
  isLocked: boolean
): Promise<void> {
  await requestJson(`/api/sessions/${sessionId}/lineages/${label}/lock`, {
    method: "POST",
    body: JSON.stringify({ isLocked }),
  });
}
