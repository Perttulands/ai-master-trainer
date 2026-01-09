import { useState, useCallback, useEffect } from "react";
import {
  MessageSquare,
  Sliders,
  FolderOpen,
  Pencil,
  Check,
  X,
  MessageCircle,
  PanelRightClose,
  PanelRightOpen,
  Plus,
} from "lucide-react";
import { Header } from "../components/layout/Header";
import { CardGrid } from "../components/cards/CardGrid";
import { ExpandedCard } from "../components/cards/ExpandedCard";
import { TrainerPanel } from "../components/panels/TrainerPanel";
import { DirectivePanel } from "../components/panels/DirectivePanel";
import { ContextPanel } from "../components/context";
import { AgentViewer } from "../components/agent/AgentViewer";
import { ExportModal } from "../components/export";
import { Button, Modal } from "../components/ui";
import { useCurrentSession } from "../hooks/useSession";
import { useLineageStore } from "../store/lineages";
import { useUIStore } from "../store/ui";
import { useAgentStore } from "../store/agents";
import { useContextStore } from "../store/context";
import { useSessionStore } from "../store/session";
import { useProgressStore, createProgressEmitter } from "../store/progress";
import { STAGE_LABELS } from "../types/progress";
import {
  respondToChat,
  getNextAvailableLabel,
  generateSingleLineage,
  type TrainerChatContext,
} from "../agents/master-trainer";
import { generateAgent } from "../agents/agent-generator";
import { updateSession } from "../db/queries";
import type { TrainerMessage, TrainerAction } from "../types";
import type { AgentDefinition } from "../types/agent";
import { generateId } from "../utils/id";
import { cn } from "../utils/cn";

export function Training() {
  const { session, lineages, sessionId } = useCurrentSession();
  const {
    canRegenerate,
    regenerateWithFullPipeline,
    isRegenerating,
    runLineage,
    addLineage,
    getExistingLabels,
    isLoading,
  } = useLineageStore();
  const {
    activePanel,
    setActivePanel,
    expandedCardId,
    closeExpandedCard,
    selectedLineageId,
    setSelectedLineage,
    isRightPanelCollapsed,
    toggleRightPanel,
  } = useUIStore();
  const { agents, loadAgentsForSession, getAgentForLineage } = useAgentStore();
  const { loadContext } = useContextStore();

  const { setCurrentSession } = useSessionStore();
  const [messages, setMessages] = useState<TrainerMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [viewingAgent, setViewingAgent] = useState<AgentDefinition | null>(
    null
  );
  const [showExportModal, setShowExportModal] = useState(false);
  const [runningLineageId, setRunningLineageId] = useState<string | null>(null);

  // Input prompt editing state
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState("");
  const [isAddingAgent, setIsAddingAgent] = useState(false);

  // Load agents and context when session loads
  useEffect(() => {
    if (sessionId) {
      loadAgentsForSession(sessionId);
      loadContext(sessionId);
    }
  }, [sessionId, loadAgentsForSession, loadContext]);

  // Load messages from session
  useEffect(() => {
    if (session?.trainerMessages) {
      setMessages(session.trainerMessages);
    }
  }, [session?.trainerMessages]);

  const expandedLineage = lineages.find((l) => l.id === expandedCardId);

  // Handler to view an agent - shows the real agent for this lineage
  const handleViewAgent = useCallback(
    (lineageId: string) => {
      // Get the real agent from the store/database
      const agent = getAgentForLineage(lineageId);
      if (agent) {
        setViewingAgent(agent);
      } else {
        // This shouldn't happen in normal flow, but log for debugging
        console.warn(`No agent found for lineage ${lineageId}`);
      }
    },
    [getAgentForLineage]
  );

  const handleCloseAgentViewer = useCallback(() => {
    setViewingAgent(null);
  }, []);

  // Input prompt editing handlers
  const handleStartEditPrompt = useCallback(() => {
    setEditedPrompt(session?.inputPrompt || "");
    setIsEditingPrompt(true);
  }, [session?.inputPrompt]);

  const handleSavePrompt = useCallback(() => {
    if (!sessionId || !session) return;
    const newPrompt = editedPrompt.trim() || null;
    updateSession(sessionId, { inputPrompt: newPrompt });
    // Update local session state
    setCurrentSession({ ...session, inputPrompt: newPrompt });
    setIsEditingPrompt(false);
  }, [sessionId, session, editedPrompt, setCurrentSession]);

  const handleCancelEditPrompt = useCallback(() => {
    setIsEditingPrompt(false);
    setEditedPrompt("");
  }, []);

  // Handler to run a specific lineage (executes current agent without evolution)
  const handleRunLineage = useCallback(
    async (lineageId: string) => {
      if (!session) return;
      setRunningLineageId(lineageId);
      try {
        await runLineage(lineageId, session.need, getAgentForLineage);
      } finally {
        setRunningLineageId(null);
      }
    },
    [session, runLineage, getAgentForLineage]
  );

  // Handler to add a new agent mid-session
  const handleAddAgent = useCallback(async () => {
    if (!session || !sessionId) return;

    const existingLabels = getExistingLabels();
    const nextLabel = getNextAvailableLabel(existingLabels);

    if (!nextLabel) {
      console.warn("Maximum agents (8) reached");
      return;
    }

    setIsAddingAgent(true);
    try {
      // Generate content for the new lineage
      const lineageConfig = await generateSingleLineage(
        session.need,
        nextLabel,
        session.constraints ?? undefined
      );

      // Generate agent definition
      const agent = await generateAgent({
        need: session.need,
        constraints: session.constraints ?? undefined,
        label: nextLabel,
        strategyTag: lineageConfig.strategyTag,
      });

      // Add the lineage with the generated agent
      await addLineage(sessionId, {
        label: nextLabel,
        strategyTag: lineageConfig.strategyTag,
        agent,
      });

      // Reload agents
      loadAgentsForSession(sessionId);
    } catch (error) {
      console.error("Failed to add agent:", error);
    } finally {
      setIsAddingAgent(false);
    }
  }, [session, sessionId, getExistingLabels, addLineage, loadAgentsForSession]);

  // Prepare agents array for export modal with lineage labels
  const agentsForExport = lineages
    .map((lineage) => {
      const agent = agents.get(lineage.id);
      if (!agent) return null;
      return { lineageLabel: lineage.label, agent };
    })
    .filter((item) => item !== null) as {
    lineageLabel: string;
    agent: import("../types/agent").AgentDefinition;
  }[];

  const handleRegenerate = useCallback(async () => {
    if (!session || !sessionId) return;

    // Get unlocked lineages for progress tracking
    const unlockedLineages = lineages.filter(l => !l.isLocked);
    if (unlockedLineages.length === 0) return;

    // Start progress tracking
    const { startOperation, completeOperation, failOperation } = useProgressStore.getState();
    const items = unlockedLineages.map(l => ({ id: l.label, label: `Lineage ${l.label}` }));
    startOperation('regeneration', items);
    const progressEmitter = createProgressEmitter();

    // Set initial stage
    progressEmitter.stage('analyzing_reward', STAGE_LABELS.analyzing_reward);

    try {
      // Use the full Agent Lightning evolution pipeline:
      // Reward Analysis → Credit Assignment → Evolution Planning → Agent Evolution
      // This replaces the previous inline evolver which bypassed these steps
      await regenerateWithFullPipeline(
        sessionId,
        session.need,
        getAgentForLineage,
        progressEmitter
      );

      // Complete the operation
      completeOperation();

      // Reload agents after regeneration
      loadAgentsForSession(sessionId);
    } catch (err) {
      console.error('Regeneration failed:', err);
      failOperation(err instanceof Error ? err.message : 'Regeneration failed');
    }
  }, [
    session,
    sessionId,
    lineages,
    regenerateWithFullPipeline,
    getAgentForLineage,
    loadAgentsForSession,
  ]);

  const handleSendMessage = useCallback(
    async (content: string) => {
      const userMessage: TrainerMessage = {
        id: generateId(),
        role: "user",
        content,
        timestamp: Date.now(),
      };

      const newMessages = [...messages, userMessage];
      setMessages(newMessages);
      if (sessionId) {
        updateSession(sessionId, { trainerMessages: newMessages });
      }
      setIsChatLoading(true);

      try {
        // Build rich context for the trainer
        const context: TrainerChatContext = {
          need: session?.need ?? "",
          lineages: lineages.map((l) => ({
            id: l.id,
            label: l.label,
            cycle: l.cycle,
            isLocked: l.isLocked,
            score: l.currentEvaluation?.score,
            comment: l.currentEvaluation?.comment ?? undefined,
            stickyDirective: l.directiveSticky ?? undefined,
            content: l.currentArtifact?.content,
          })),
        };

        const response = await respondToChat(content, context);
        const updatedMessages = [...newMessages, response];
        setMessages(updatedMessages);
        if (sessionId) {
          updateSession(sessionId, { trainerMessages: updatedMessages });
        }
      } catch (error) {
        console.error("Chat error:", error);
      } finally {
        setIsChatLoading(false);
      }
    },
    [session, lineages, messages, sessionId]
  );

  const handleResetChat = useCallback(() => {
    if (sessionId) {
      setMessages([]);
      updateSession(sessionId, { trainerMessages: [] });
    }
  }, [sessionId]);

  // Handler to apply trainer-proposed actions
  const handleApplyActions = useCallback(
    async (actions: TrainerAction[]) => {
      const { setScore, addDirective } = useLineageStore.getState();

      for (const action of actions) {
        switch (action.kind) {
          case "set_grade":
            if (action.lineageId) {
              setScore(action.lineageId, action.grade);
            }
            break;
          case "add_comment":
            if (action.lineageId) {
              // Map legacy comments to oneshot directives
              addDirective(action.lineageId, "oneshot", action.comment);
            }
            break;
          case "set_directive":
            if (action.lineageId) {
              addDirective(
                action.lineageId,
                action.directive.type,
                action.directive.content
              );
            }
            break;
          case "add_lineage":
            // Add the requested number of agents
            for (let i = 0; i < action.count; i++) {
              await handleAddAgent();
            }
            break;
          default:
            // Ignore unknown actions
            break;
        }
      }
    },
    [handleAddAgent]
  );

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden flex flex-col">
      <Header
        session={session}
        onRegenerate={handleRegenerate}
        canRegenerate={canRegenerate()}
        isRegenerating={isRegenerating}
        onExport={() => setShowExportModal(true)}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Main content - Card Grid */}
        <main className="flex-1 p-4 overflow-auto">
          {/* Input Prompt Section */}
          <div className="mb-4 p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="flex items-start gap-3">
              <MessageCircle className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-medium text-gray-700">
                    Input Prompt
                  </h3>
                  {!isEditingPrompt && (
                    <button
                      onClick={handleStartEditPrompt}
                      className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Edit input prompt"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {isEditingPrompt ? (
                  <div className="space-y-2">
                    <textarea
                      value={editedPrompt}
                      onChange={(e) => setEditedPrompt(e.target.value)}
                      placeholder="Enter the input prompt that agents will respond to..."
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
                      rows={3}
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={handleCancelEditPrompt}
                        className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                        title="Cancel"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handleSavePrompt}
                        className="p-1.5 text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded transition-colors"
                        title="Save"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-600">
                    {session.inputPrompt || (
                      <span className="text-gray-400 italic">
                        No input prompt set. Click edit to add one, or agents
                        will use a generic prompt based on your need.
                      </span>
                    )}
                  </p>
                )}
              </div>
            </div>
          </div>

          <CardGrid
            lineages={lineages}
            onViewAgent={handleViewAgent}
            onRun={handleRunLineage}
            runningLineageId={runningLineageId}
          />

          {/* Add Agent Button - show if less than 8 agents */}
          {lineages.length < 8 && (
            <div className="mt-4 flex justify-center">
              <Button
                onClick={handleAddAgent}
                variant="outline"
                disabled={isAddingAgent || isLoading}
                className="gap-2"
              >
                <Plus
                  className={cn("w-4 h-4", isAddingAgent && "animate-spin")}
                />
                {isAddingAgent ? "Adding Agent..." : "Add Agent"}
              </Button>
            </div>
          )}

          {/* Score requirement notice */}
          {!canRegenerate() && lineages.length > 0 && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
              Score all unlocked lineages before regenerating.
            </div>
          )}
        </main>

        {/* Right Panel */}
        <aside
          className={cn(
            "border-l border-gray-200 flex flex-col bg-gray-50 transition-all duration-200 min-h-0",
            isRightPanelCollapsed ? "w-12" : "w-96"
          )}
        >
          {/* Panel Header with Toggle */}
          <div className="flex items-center border-b border-gray-200 bg-white">
            {/* Toggle Button */}
            <button
              onClick={toggleRightPanel}
              className="p-3 text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              title={isRightPanelCollapsed ? "Expand panel" : "Collapse panel"}
            >
              {isRightPanelCollapsed ? (
                <PanelRightOpen className="w-5 h-5" />
              ) : (
                <PanelRightClose className="w-5 h-5" />
              )}
            </button>

            {/* Panel Tabs - only show when expanded */}
            {!isRightPanelCollapsed && (
              <>
                <button
                  onClick={() => setActivePanel("trainer")}
                  className={cn(
                    "flex-1 px-3 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors",
                    activePanel === "trainer"
                      ? "text-primary-600 border-b-2 border-primary-600"
                      : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  <MessageSquare className="w-4 h-4" />
                  Trainer
                </button>
                <button
                  onClick={() => setActivePanel("directives")}
                  className={cn(
                    "flex-1 px-3 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors",
                    activePanel === "directives"
                      ? "text-primary-600 border-b-2 border-primary-600"
                      : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  <Sliders className="w-4 h-4" />
                  Directives
                </button>
                <button
                  onClick={() => setActivePanel("context")}
                  className={cn(
                    "flex-1 px-3 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors",
                    activePanel === "context"
                      ? "text-primary-600 border-b-2 border-primary-600"
                      : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  <FolderOpen className="w-4 h-4" />
                  Context
                </button>
              </>
            )}
          </div>

          {/* Collapsed Icon Strip */}
          {isRightPanelCollapsed && (
            <div className="flex flex-col items-center py-2 gap-1">
              <button
                onClick={() => {
                  toggleRightPanel();
                  setActivePanel("trainer");
                }}
                className={cn(
                  "p-2 rounded transition-colors",
                  activePanel === "trainer"
                    ? "text-primary-600 bg-primary-50"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                )}
                title="Trainer"
              >
                <MessageSquare className="w-5 h-5" />
              </button>
              <button
                onClick={() => {
                  toggleRightPanel();
                  setActivePanel("directives");
                }}
                className={cn(
                  "p-2 rounded transition-colors",
                  activePanel === "directives"
                    ? "text-primary-600 bg-primary-50"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                )}
                title="Directives"
              >
                <Sliders className="w-5 h-5" />
              </button>
              <button
                onClick={() => {
                  toggleRightPanel();
                  setActivePanel("context");
                }}
                className={cn(
                  "p-2 rounded transition-colors",
                  activePanel === "context"
                    ? "text-primary-600 bg-primary-50"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                )}
                title="Context"
              >
                <FolderOpen className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Panel Content - only show when expanded */}
          {!isRightPanelCollapsed && (
            <div className="flex-1 flex flex-col min-h-0 p-4">
              {activePanel === "trainer" && (
                <TrainerPanel
                  messages={messages}
                  onSendMessage={handleSendMessage}
                  onApplyActions={handleApplyActions}
                  onResetChat={handleResetChat}
                  isLoading={isChatLoading}
                />
              )}
              {activePanel === "directives" && (
                <DirectivePanel
                  lineages={lineages}
                  selectedLineageId={selectedLineageId}
                  onSelectLineage={setSelectedLineage}
                />
              )}
              {activePanel === "context" && sessionId && (
                <ContextPanel sessionId={sessionId} />
              )}
            </div>
          )}
        </aside>
      </div>

      {/* Expanded Card Modal */}
      {expandedLineage && (
        <ExpandedCard lineage={expandedLineage} onClose={closeExpandedCard} />
      )}

      {/* Agent Viewer Modal */}
      {viewingAgent && (
        <Modal isOpen={true} onClose={handleCloseAgentViewer} size="xl">
          <AgentViewer agent={viewingAgent} onClose={handleCloseAgentViewer} />
        </Modal>
      )}

      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        agents={agentsForExport}
        sessionId={sessionId ?? undefined}
      />
    </div>
  );
}
