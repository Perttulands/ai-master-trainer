import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Star, Bug, Activity, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent, Badge } from '../components/ui';
import { Header } from '../components/layout/Header';
import { LLMDebugPanel } from '../components/debug';
import { useSessionStore } from '../store/session';
import { useLLMDebugStore } from '../store/llm-debug';
import { getArtifactsByLineage, getLineagesBySession, getEvaluationForArtifact } from '../db/queries';
import { getTrainingEventsBySession, getPayload } from '../db/training-signal-queries';
import type { Lineage, Artifact, Evaluation } from '../types';
import type { TrainingEvent } from '../types/training-signal';
import { cn } from '../utils/cn';

type HistoryTab = 'artifacts' | 'debug' | 'signals';

interface LineageHistory {
  lineage: Lineage;
  artifacts: (Artifact & { evaluation: Evaluation | null })[];
}

function TrainingEventCard({ event }: { event: TrainingEvent }) {
  const [expanded, setExpanded] = useState(false);
  const payload = getPayload(event.payloadHash);

  return (
    <Card className="overflow-hidden">
      <div
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900">{event.eventType}</span>
              <span className="text-xs text-gray-500">
                {new Date(event.timestamp).toLocaleString()}
              </span>
            </div>
            <div className="flex gap-1 mt-1 flex-wrap">
              {event.tags.map(tag => (
                <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 p-4">
          <pre className="text-xs font-mono overflow-auto max-h-96 whitespace-pre-wrap text-gray-700">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </div>
      )}
    </Card>
  );
}

function TrainingSignalsPanel({ sessionId }: { sessionId: string }) {
  const [events, setEvents] = useState<TrainingEvent[]>([]);

  useEffect(() => {
    const loadedEvents = getTrainingEventsBySession(sessionId);
    setEvents(loadedEvents);
  }, [sessionId]);

  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-8 text-gray-500">
          No training signals recorded for this session.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {events.map(event => (
        <TrainingEventCard key={event.id} event={event} />
      ))}
    </div>
  );
}

export function History() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentSession, loadSession } = useSessionStore();
  const [histories, setHistories] = useState<LineageHistory[]>([]);
  const [selectedLineage, setSelectedLineage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<HistoryTab>('artifacts');

  // Get debug entries for this session
  const { entries: allDebugEntries, clearEntries } = useLLMDebugStore();
  const sessionDebugEntries = id
    ? allDebugEntries.filter((e) => e.sessionId === id)
    : allDebugEntries;
  const errorCount = sessionDebugEntries.filter((e) => e.status === 'error').length;

  useEffect(() => {
    if (id) {
      loadSession(id);

      // Load lineages and their artifacts
      const lineages = getLineagesBySession(id);
      const lineageHistories = lineages.map((lineage) => {
        const artifacts = getArtifactsByLineage(lineage.id);
        return {
          lineage,
          artifacts: artifacts.map((artifact) => ({
            ...artifact,
            evaluation: getEvaluationForArtifact(artifact.id),
          })),
        };
      });
      setHistories(lineageHistories);

      if (lineageHistories.length > 0) {
        setSelectedLineage(lineageHistories[0].lineage.id);
      }
    }
  }, [id, loadSession]);

  const selectedHistory = histories.find((h) => h.lineage.id === selectedLineage);

  return (
    <div className="min-h-screen flex flex-col">
      <Header session={currentSession} />

      <main className="flex-1 max-w-6xl mx-auto px-4 py-8 w-full">
        <button
          onClick={() => navigate(`/session/${id}`)}
          className="flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to training
        </button>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Session History</h1>

        {/* Tab selector */}
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('artifacts')}
            className={cn(
              'px-4 py-2 font-medium text-sm transition-colors border-b-2 -mb-px',
              activeTab === 'artifacts'
                ? 'text-primary-600 border-primary-500'
                : 'text-gray-500 border-transparent hover:text-gray-700'
            )}
          >
            Artifacts
          </button>
          <button
            onClick={() => setActiveTab('signals')}
            className={cn(
              'px-4 py-2 font-medium text-sm transition-colors border-b-2 -mb-px flex items-center gap-2',
              activeTab === 'signals'
                ? 'text-primary-600 border-primary-500'
                : 'text-gray-500 border-transparent hover:text-gray-700'
            )}
          >
            <Activity className="w-4 h-4" />
            Training Signals
          </button>
          <button
            onClick={() => setActiveTab('debug')}
            className={cn(
              'px-4 py-2 font-medium text-sm transition-colors border-b-2 -mb-px flex items-center gap-2',
              activeTab === 'debug'
                ? 'text-primary-600 border-primary-500'
                : 'text-gray-500 border-transparent hover:text-gray-700'
            )}
          >
            <Bug className="w-4 h-4" />
            LLM Debug
            {errorCount > 0 && (
              <Badge variant="danger" className="ml-1">
                {errorCount}
              </Badge>
            )}
          </button>
        </div>

        {activeTab === 'debug' ? (
          <LLMDebugPanel entries={allDebugEntries} onClear={clearEntries} />
        ) : activeTab === 'signals' ? (
          <TrainingSignalsPanel sessionId={id!} />
        ) : (
        <div className="flex gap-6">
          {/* Lineage Selector */}
          <div className="w-48 space-y-2">
            <h2 className="text-sm font-medium text-gray-500 mb-3">Lineages</h2>
            {histories.map(({ lineage }) => (
              <button
                key={lineage.id}
                onClick={() => setSelectedLineage(lineage.id)}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-lg transition-colors',
                  selectedLineage === lineage.id
                    ? 'bg-primary-50 border-2 border-primary-500'
                    : 'bg-white border border-gray-200 hover:border-gray-300'
                )}
              >
                <span
                  className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white',
                    lineage.label === 'A' && 'bg-blue-500',
                    lineage.label === 'B' && 'bg-purple-500',
                    lineage.label === 'C' && 'bg-orange-500',
                    lineage.label === 'D' && 'bg-teal-500'
                  )}
                >
                  {lineage.label}
                </span>
                <div className="text-left">
                  <p className="font-medium text-gray-900">Lineage {lineage.label}</p>
                  {lineage.strategyTag && (
                    <p className="text-xs text-gray-500">{lineage.strategyTag}</p>
                  )}
                </div>
                {lineage.isLocked && (
                  <Badge variant="success" className="ml-auto">Locked</Badge>
                )}
              </button>
            ))}
          </div>

          {/* Timeline */}
          <div className="flex-1">
            {selectedHistory ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">
                    Lineage {selectedHistory.lineage.label} Timeline
                  </h2>
                  <Badge variant="default">
                    {selectedHistory.artifacts.length} cycles
                  </Badge>
                </div>

                {selectedHistory.artifacts.length === 0 ? (
                  <Card>
                    <CardContent className="text-center py-8 text-gray-500">
                      No artifacts yet
                    </CardContent>
                  </Card>
                ) : (
                  <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200" />

                    {/* Timeline items */}
                    <div className="space-y-4">
                      {selectedHistory.artifacts.map((artifact, index) => (
                        <div key={artifact.id} className="relative pl-14">
                          {/* Timeline dot */}
                          <div
                            className={cn(
                              'absolute left-4 w-5 h-5 rounded-full border-2 bg-white',
                              index === 0
                                ? 'border-primary-500'
                                : 'border-gray-300'
                            )}
                          />

                          <Card>
                            <CardContent>
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <Badge variant="primary">Cycle {artifact.cycle}</Badge>
                                  <span className="text-xs text-gray-400 flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {new Date(artifact.createdAt).toLocaleString()}
                                  </span>
                                </div>
                                {artifact.evaluation && (
                                  <div className="flex items-center gap-1">
                                    <Star className="w-4 h-4 text-yellow-500" />
                                    <span className="font-medium">
                                      {artifact.evaluation.score}/10
                                    </span>
                                  </div>
                                )}
                              </div>

                              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 max-h-40 overflow-auto">
                                <pre className="whitespace-pre-wrap font-mono text-xs">
                                  {artifact.content.slice(0, 500)}
                                  {artifact.content.length > 500 && '...'}
                                </pre>
                              </div>

                              {artifact.evaluation?.comment && (
                                <p className="mt-2 text-sm text-gray-600 italic">
                                  "{artifact.evaluation.comment}"
                                </p>
                              )}
                            </CardContent>
                          </Card>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Card>
                <CardContent className="text-center py-8 text-gray-500">
                  Select a lineage to view its history
                </CardContent>
              </Card>
            )}
          </div>
        </div>
        )}
      </main>
    </div>
  );
}
