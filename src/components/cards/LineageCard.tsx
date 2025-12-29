import { Lock, Unlock, Maximize2, MessageSquare, Eye, Play, AlertCircle } from 'lucide-react';
import { Card, CardHeader, CardContent, CardFooter, Badge, ScoreSlider } from '../ui';
import { cn } from '../../utils/cn';
import type { LineageWithArtifact, ArtifactMetadata } from '../../types';
import { useLineageStore } from '../../store/lineages';
import { useUIStore } from '../../store/ui';

interface LineageCardProps {
  lineage: LineageWithArtifact;
  onViewAgent?: (lineageId: string) => void;
  onRun?: (lineageId: string) => void;
  isRunning?: boolean;
}

export function LineageCard({ lineage, onViewAgent, onRun, isRunning }: LineageCardProps) {
  const { toggleLock, setScore } = useLineageStore();
  const { expandCard, openDirectivesForLineage } = useUIStore();

  const hasDirective = lineage.directiveSticky || lineage.directiveOneshot;

  const getPreview = () => {
    const artifact = lineage.currentArtifact;
    if (!artifact) return { text: 'No output yet', isError: false };

    const metadata = artifact.metadata as ArtifactMetadata | null;

    if (metadata?.executionSuccess === false) {
      const errorMsg = metadata.error
        ? `Execution failed: ${metadata.error}`
        : 'Execution failed';
      return { text: errorMsg, isError: true };
    }

    return {
      text: artifact.content?.slice(0, 200) || 'Empty response',
      isError: false,
    };
  };

  const { text: preview, isError: previewIsError } = getPreview();

  return (
    <Card
      variant={lineage.isLocked ? 'outlined' : 'default'}
      className={cn(
        'flex flex-col h-full transition-all',
        lineage.isLocked && 'border-green-500 bg-green-50/30'
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white',
              lineage.label === 'A' && 'bg-blue-500',
              lineage.label === 'B' && 'bg-purple-500',
              lineage.label === 'C' && 'bg-orange-500',
              lineage.label === 'D' && 'bg-teal-500',
              lineage.label === 'E' && 'bg-pink-500',
              lineage.label === 'F' && 'bg-indigo-500',
              lineage.label === 'G' && 'bg-emerald-500',
              lineage.label === 'H' && 'bg-amber-500'
            )}
          >
            {lineage.label}
          </span>
          <Badge variant="secondary" className="text-xs">
            Cycle {lineage.cycle}
          </Badge>
          {lineage.strategyTag && (
            <Badge variant="default">{lineage.strategyTag}</Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {hasDirective && (
            <button
              onClick={() => openDirectivesForLineage(lineage.id)}
              className="p-1.5 rounded-lg text-primary-600 hover:bg-primary-50 transition-colors"
              title="Has directive"
            >
              <MessageSquare className="w-4 h-4" />
            </button>
          )}
          {onRun && (
            <button
              onClick={() => onRun(lineage.id)}
              disabled={isRunning}
              className={cn(
                'p-1.5 rounded-lg transition-colors',
                isRunning
                  ? 'text-amber-500 bg-amber-50'
                  : 'text-gray-400 hover:text-amber-600 hover:bg-amber-50'
              )}
              title={isRunning ? 'Running...' : 'Run Agent'}
            >
              <Play className={cn('w-4 h-4', isRunning && 'animate-pulse')} />
            </button>
          )}
          <button
            onClick={() => onViewAgent?.(lineage.id)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title="View Agent"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={() => expandCard(lineage.id)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title="Expand"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => toggleLock(lineage.id)}
            className={cn(
              'p-1.5 rounded-lg transition-colors',
              lineage.isLocked
                ? 'text-green-600 bg-green-100 hover:bg-green-200'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            )}
            title={lineage.isLocked ? 'Unlock' : 'Lock'}
          >
            {lineage.isLocked ? (
              <Lock className="w-4 h-4" />
            ) : (
              <Unlock className="w-4 h-4" />
            )}
          </button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden">
        <div
          className={cn(
            'text-sm line-clamp-6 whitespace-pre-wrap',
            previewIsError ? 'text-red-600' : 'text-gray-600'
          )}
        >
          {previewIsError && (
            <AlertCircle className="w-4 h-4 inline-block mr-1 -mt-0.5" />
          )}
          {preview}
          {!previewIsError &&
            lineage.currentArtifact &&
            lineage.currentArtifact.content.length > 200 &&
            '...'}
        </div>
      </CardContent>

      <CardFooter className="space-y-3">
        {!lineage.isLocked && (
          <ScoreSlider
            value={lineage.currentEvaluation?.score ?? null}
            onChange={(score) => setScore(lineage.id, score)}
          />
        )}
        {lineage.isLocked && lineage.currentEvaluation && (
          <div className="text-center text-sm">
            <span className="text-gray-500">Locked with score: </span>
            <span className="font-bold text-green-600">
              {lineage.currentEvaluation.score}/10
            </span>
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
