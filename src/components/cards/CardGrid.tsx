import { LineageCard } from './LineageCard';
import type { LineageWithArtifact } from '../../types';

interface CardGridProps {
  lineages: LineageWithArtifact[];
}

export function CardGrid({ lineages }: CardGridProps) {
  if (lineages.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No lineages yet. Start by generating initial options.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
      {lineages.map((lineage) => (
        <LineageCard key={lineage.id} lineage={lineage} />
      ))}
    </div>
  );
}
