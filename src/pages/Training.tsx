import { useState, useCallback, useEffect } from 'react';
import { MessageSquare, Sliders, FolderOpen } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { CardGrid } from '../components/cards/CardGrid';
import { ExpandedCard } from '../components/cards/ExpandedCard';
import { TrainerPanel } from '../components/panels/TrainerPanel';
import { DirectivePanel } from '../components/panels/DirectivePanel';
import { ContextPanel } from '../components/context';
import { AgentViewer } from '../components/agent/AgentViewer';
import { ExportModal } from '../components/export';
import { Modal } from '../components/ui';
import { useCurrentSession } from '../hooks/useSession';
import { useLineageStore, type RegenerateWithAgentsOptions } from '../store/lineages';
import { useUIStore } from '../store/ui';
import { useAgentStore } from '../store/agents';
import { useContextStore } from '../store/context';
import { respondToChat } from '../agents/master-trainer';
import { evolveAgent } from '../services/agent-evolver';
import { generateFallbackAgent } from '../agents/agent-generator';
import type { TrainerMessage } from '../types';
import type { AgentDefinition } from '../types/agent';
import { generateId } from '../utils/id';
import { cn } from '../utils/cn';

export function Training() {
  const { session, lineages, sessionId } = useCurrentSession();
  const { canRegenerate, regenerateUnlockedWithAgents, isRegenerating } = useLineageStore();
  const {
    activePanel,
    setActivePanel,
    expandedCardId,
    closeExpandedCard,
    selectedLineageId,
    setSelectedLineage,
  } = useUIStore();
  const { agents, loadAgentsForSession, getAgentForLineage } = useAgentStore();
  const { loadContext } = useContextStore();

  const [messages, setMessages] = useState<TrainerMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [viewingAgent, setViewingAgent] = useState<AgentDefinition | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);

  // Load agents and context when session loads
  useEffect(() => {
    if (sessionId) {
      loadAgentsForSession(sessionId);
      loadContext(sessionId);
    }
  }, [sessionId, loadAgentsForSession, loadContext]);

  const expandedLineage = lineages.find((l) => l.id === expandedCardId);

  // Handler to view an agent - shows the real agent for this lineage
  const handleViewAgent = useCallback((lineageId: string) => {
    // Get the real agent from the store/database
    const agent = getAgentForLineage(lineageId);
    if (agent) {
      setViewingAgent(agent);
    } else {
      // This shouldn't happen in normal flow, but log for debugging
      console.warn(`No agent found for lineage ${lineageId}`);
    }
  }, [getAgentForLineage]);

  const handleCloseAgentViewer = useCallback(() => {
    setViewingAgent(null);
  }, []);

  // Prepare agents array for export modal with lineage labels
  const agentsForExport = lineages
    .map((lineage) => {
      const agent = agents.get(lineage.id);
      if (!agent) return null;
      return { lineageLabel: lineage.label, agent };
    })
    .filter((item) => item !== null) as { lineageLabel: string; agent: import('../types/agent').AgentDefinition }[];

  const handleRegenerate = useCallback(async () => {
    if (!session || !sessionId) return;

    const evolveAgentFn = async (options: RegenerateWithAgentsOptions): Promise<AgentDefinition> => {
      const { lineage, currentAgent, need, previousScore } = options;

      // If we have a current agent, evolve it using the full evolver
      // The full evolver modifies all components: prompt, tools, flow, parameters
      if (currentAgent) {
        // Get feedback comment from current evaluation if available
        const feedback = lineage.currentEvaluation?.comment ?? null;

        return evolveAgent(
          currentAgent,
          need,
          previousScore,
          feedback,
          lineage.directiveSticky ?? null,
          lineage.directiveOneshot ?? null
        );
      }

      // If no agent exists, create a new one using fallback generation
      const fallbackConfig = generateFallbackAgent(lineage.label, need);
      return fallbackConfig.agent;
    };

    await regenerateUnlockedWithAgents(
      sessionId,
      session.need,
      evolveAgentFn,
      getAgentForLineage
    );

    // Reload agents after regeneration
    loadAgentsForSession(sessionId);
  }, [session, sessionId, regenerateUnlockedWithAgents, getAgentForLineage, loadAgentsForSession]);

  const handleSendMessage = useCallback(
    async (content: string) => {
      const userMessage: TrainerMessage = {
        id: generateId(),
        role: 'user',
        content,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsChatLoading(true);

      try {
        const response = await respondToChat(content, {
          need: session?.need ?? '',
          lineagesCount: lineages.length,
          currentCycle: lineages[0]?.cycle ?? 0,
        });
        setMessages((prev) => [...prev, response]);
      } catch (error) {
        console.error('Chat error:', error);
      } finally {
        setIsChatLoading(false);
      }
    },
    [session, lineages]
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
    <div className="min-h-screen flex flex-col">
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
          <CardGrid lineages={lineages} onViewAgent={handleViewAgent} />

          {/* Score requirement notice */}
          {!canRegenerate() && lineages.length > 0 && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
              Score all unlocked lineages before regenerating.
            </div>
          )}
        </main>

        {/* Right Panel */}
        <aside className="w-96 border-l border-gray-200 flex flex-col bg-gray-50">
          {/* Panel Tabs */}
          <div className="flex border-b border-gray-200 bg-white">
            <button
              onClick={() => setActivePanel('trainer')}
              className={cn(
                'flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors',
                activePanel === 'trainer'
                  ? 'text-primary-600 border-b-2 border-primary-600'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <MessageSquare className="w-4 h-4" />
              Trainer
            </button>
            <button
              onClick={() => setActivePanel('directives')}
              className={cn(
                'flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors',
                activePanel === 'directives'
                  ? 'text-primary-600 border-b-2 border-primary-600'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <Sliders className="w-4 h-4" />
              Directives
            </button>
            <button
              onClick={() => setActivePanel('context')}
              className={cn(
                'flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors',
                activePanel === 'context'
                  ? 'text-primary-600 border-b-2 border-primary-600'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <FolderOpen className="w-4 h-4" />
              Context
            </button>
          </div>

          {/* Panel Content */}
          <div className="flex-1 p-4 overflow-hidden">
            {activePanel === 'trainer' && (
              <TrainerPanel
                messages={messages}
                onSendMessage={handleSendMessage}
                isLoading={isChatLoading}
              />
            )}
            {activePanel === 'directives' && (
              <DirectivePanel
                lineages={lineages}
                selectedLineageId={selectedLineageId}
                onSelectLineage={setSelectedLineage}
              />
            )}
            {activePanel === 'context' && sessionId && (
              <ContextPanel sessionId={sessionId} />
            )}
          </div>
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
      />
    </div>
  );
}
