import { Lock, Unlock, Maximize2, MessageSquare, Eye } from 'lucide-react';
import { Card, CardHeader, CardContent, CardFooter, Badge, ScoreSlider } from '../ui';
import { cn } from '../../utils/cn';
import type { LineageWithArtifact } from '../../types';
import { useLineageStore } from '../../store/lineages';
import { useUIStore } from '../../store/ui';

interface LineageCardProps {
  lineage: LineageWithArtifact;
  onViewAgent?: (lineageId: string) => void;
}

export function LineageCard({ lineage, onViewAgent }: LineageCardProps) {
  const { toggleLock, setScore } = useLineageStore();
  const { expandCard, openDirectivesForLineage } = useUIStore();

  const hasDirective = lineage.directiveSticky || lineage.directiveOneshot;
  const preview = lineage.currentArtifact?.content.slice(0, 200) || 'No content yet';

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
              lineage.label === 'D' && 'bg-teal-500'
            )}
          >
            {lineage.label}
          </span>
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
        <div className="text-sm text-gray-600 line-clamp-6 whitespace-pre-wrap">
          {preview}
          {lineage.currentArtifact && lineage.currentArtifact.content.length > 200 && '...'}
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
        <div className="text-xs text-gray-400 text-center">
          Cycle {lineage.cycle}
        </div>
      </CardFooter>
    </Card>
  );
}
