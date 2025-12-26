import { useState } from 'react';
import { Trash2, Zap, Pin } from 'lucide-react';
import { Button, Textarea, Badge } from '../ui';
import { cn } from '../../utils/cn';
import type { LineageWithArtifact } from '../../types';
import { useLineageStore } from '../../store/lineages';

interface DirectivePanelProps {
  lineages: LineageWithArtifact[];
  selectedLineageId: string | null;
  onSelectLineage: (id: string) => void;
}

export function DirectivePanel({
  lineages,
  selectedLineageId,
  onSelectLineage,
}: DirectivePanelProps) {
  const { setDirective, clearDirective } = useLineageStore();
  const [stickyInput, setStickyInput] = useState('');
  const [oneshotInput, setOneshotInput] = useState('');

  const selectedLineage = lineages.find((l) => l.id === selectedLineageId);

  const handleSetSticky = () => {
    if (selectedLineageId && stickyInput.trim()) {
      setDirective(selectedLineageId, 'sticky', stickyInput.trim());
      setStickyInput('');
    }
  };

  const handleSetOneshot = () => {
    if (selectedLineageId && oneshotInput.trim()) {
      setDirective(selectedLineageId, 'oneshot', oneshotInput.trim());
      setOneshotInput('');
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-gray-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900">Lineage Directives</h3>
        <p className="text-xs text-gray-500">Guide individual lineage evolution</p>
      </div>

      {/* Lineage Selector */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex gap-2">
          {lineages.map((lineage) => (
            <button
              key={lineage.id}
              onClick={() => onSelectLineage(lineage.id)}
              className={cn(
                'w-10 h-10 rounded-lg font-bold transition-all relative',
                selectedLineageId === lineage.id
                  ? 'ring-2 ring-primary-500 ring-offset-2'
                  : '',
                lineage.label === 'A' && 'bg-blue-500 text-white',
                lineage.label === 'B' && 'bg-purple-500 text-white',
                lineage.label === 'C' && 'bg-orange-500 text-white',
                lineage.label === 'D' && 'bg-teal-500 text-white',
                lineage.isLocked && 'opacity-50'
              )}
              disabled={lineage.isLocked}
            >
              {lineage.label}
              {(lineage.directiveSticky || lineage.directiveOneshot) && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Directive Editor */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {!selectedLineage ? (
          <div className="text-center text-gray-500 py-8">
            <p className="text-sm">Select a lineage to add directives</p>
          </div>
        ) : selectedLineage.isLocked ? (
          <div className="text-center text-gray-500 py-8">
            <p className="text-sm">Unlock this lineage to add directives</p>
          </div>
        ) : (
          <>
            {/* Current Directives */}
            {(selectedLineage.directiveSticky || selectedLineage.directiveOneshot) && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-gray-700">Active Directives</h4>

                {selectedLineage.directiveSticky && (
                  <div className="bg-blue-50 rounded-lg p-3 relative">
                    <div className="flex items-center gap-2 mb-1">
                      <Pin className="w-4 h-4 text-blue-600" />
                      <Badge variant="primary">Sticky</Badge>
                      <button
                        onClick={() => clearDirective(selectedLineage.id, 'sticky')}
                        className="ml-auto p-1 text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-sm text-gray-700">{selectedLineage.directiveSticky}</p>
                  </div>
                )}

                {selectedLineage.directiveOneshot && (
                  <div className="bg-yellow-50 rounded-lg p-3 relative">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="w-4 h-4 text-yellow-600" />
                      <Badge variant="warning">One-shot</Badge>
                      <button
                        onClick={() => clearDirective(selectedLineage.id, 'oneshot')}
                        className="ml-auto p-1 text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-sm text-gray-700">{selectedLineage.directiveOneshot}</p>
                    <p className="text-xs text-yellow-600 mt-1">Will be cleared after next regeneration</p>
                  </div>
                )}
              </div>
            )}

            {/* Add Sticky Directive */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Pin className="w-4 h-4 text-blue-600" />
                <h4 className="text-sm font-medium text-gray-700">Sticky Directive</h4>
              </div>
              <p className="text-xs text-gray-500">Persists across all future cycles</p>
              <Textarea
                value={stickyInput}
                onChange={(e) => setStickyInput(e.target.value)}
                placeholder="e.g., Use provocative hooks"
                rows={2}
              />
              <Button
                size="sm"
                onClick={handleSetSticky}
                disabled={!stickyInput.trim()}
              >
                Set Sticky Directive
              </Button>
            </div>

            {/* Add One-shot Directive */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-600" />
                <h4 className="text-sm font-medium text-gray-700">One-shot Directive</h4>
              </div>
              <p className="text-xs text-gray-500">Applies only to next regeneration</p>
              <Textarea
                value={oneshotInput}
                onChange={(e) => setOneshotInput(e.target.value)}
                placeholder="e.g., Try a completely different approach"
                rows={2}
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={handleSetOneshot}
                disabled={!oneshotInput.trim()}
              >
                Set One-shot Directive
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
