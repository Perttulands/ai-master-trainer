import { LineageCard } from './LineageCard';
import type { LineageWithArtifact } from '../../types';
import { cn } from '../../utils/cn';

interface CardGridProps {
  lineages: LineageWithArtifact[];
  onViewAgent?: (lineageId: string) => void;
  onRun?: (lineageId: string) => void;
  runningLineageId?: string | null;
}

export function CardGrid({ lineages, onViewAgent, onRun, runningLineageId }: CardGridProps) {
  if (lineages.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No lineages yet. Start by generating initial options.
      </div>
    );
  }

  // Dynamic grid classes based on lineage count
  const getGridClasses = () => {
    const count = lineages.length;
    if (count === 1) {
      return 'grid-cols-1 max-w-xl mx-auto';
    }
    if (count === 2) {
      return 'grid-cols-1 md:grid-cols-2';
    }
    if (count <= 4) {
      return 'grid-cols-1 md:grid-cols-2';
    }
    // 5-8 agents: 2 columns on medium, 3 on large
    return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
  };

  return (
    <div className={cn('grid gap-4 h-full', getGridClasses())}>
      {lineages.map((lineage) => (
        <LineageCard
          key={lineage.id}
          lineage={lineage}
          onViewAgent={onViewAgent}
          onRun={onRun}
          isRunning={runningLineageId === lineage.id}
        />
      ))}
    </div>
  );
}
