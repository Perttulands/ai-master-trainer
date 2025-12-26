import { useState, useCallback } from 'react';
import { MessageSquare, Sliders } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { CardGrid } from '../components/cards/CardGrid';
import { ExpandedCard } from '../components/cards/ExpandedCard';
import { TrainerPanel } from '../components/panels/TrainerPanel';
import { DirectivePanel } from '../components/panels/DirectivePanel';
import { useCurrentSession } from '../hooks/useSession';
import { useLineageStore } from '../store/lineages';
import { useUIStore } from '../store/ui';
import { evolveLineage, respondToChat } from '../agents/master-trainer';
import type { TrainerMessage, Lineage } from '../types';
import { generateId } from '../utils/id';
import { cn } from '../utils/cn';

export function Training() {
  const { session, lineages, sessionId } = useCurrentSession();
  const { canRegenerate, regenerateUnlocked, isRegenerating } = useLineageStore();
  const {
    activePanel,
    setActivePanel,
    expandedCardId,
    closeExpandedCard,
    selectedLineageId,
    setSelectedLineage,
  } = useUIStore();

  const [messages, setMessages] = useState<TrainerMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  const expandedLineage = lineages.find((l) => l.id === expandedCardId);

  const handleRegenerate = useCallback(async () => {
    if (!session || !sessionId) return;

    const generateArtifact = async (lineage: Lineage, cycle: number): Promise<string> => {
      const lineageWithArtifact = lineages.find((l) => l.id === lineage.id);
      const previousScore = lineageWithArtifact?.currentEvaluation?.score ?? 5;
      const previousContent = lineageWithArtifact?.currentArtifact?.content ?? '';

      return evolveLineage(lineage, session.need, previousScore, previousContent, cycle);
    };

    await regenerateUnlocked(sessionId, generateArtifact);
  }, [session, sessionId, lineages, regenerateUnlocked]);

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
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Main content - Card Grid */}
        <main className="flex-1 p-4 overflow-auto">
          <CardGrid lineages={lineages} />

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
          </div>
        </aside>
      </div>

      {/* Expanded Card Modal */}
      {expandedLineage && (
        <ExpandedCard lineage={expandedLineage} onClose={closeExpandedCard} />
      )}
    </div>
  );
}
