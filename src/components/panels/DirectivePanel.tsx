import { useState } from 'react';
import { Trash2, Zap, Pin, Plus } from 'lucide-react';
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
  const { addDirective, removeDirective } = useLineageStore();
  const [stickyInput, setStickyInput] = useState('');
  const [oneshotInput, setOneshotInput] = useState('');

  const selectedLineage = lineages.find((l) => l.id === selectedLineageId);

  const handleAddSticky = () => {
    if (selectedLineageId && stickyInput.trim()) {
      addDirective(selectedLineageId, 'sticky', stickyInput.trim());
      setStickyInput('');
    }
  };

  const handleAddOneshot = () => {
    if (selectedLineageId && oneshotInput.trim()) {
      addDirective(selectedLineageId, 'oneshot', oneshotInput.trim());
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
              {((lineage.directiveSticky?.length ?? 0) > 0 || (lineage.directiveOneshot?.length ?? 0) > 0) && (
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
            {/* Sticky Directives */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Pin className="w-4 h-4 text-blue-600" />
                <h4 className="text-sm font-medium text-gray-700">Sticky Directives</h4>
                <Badge variant="secondary" className="ml-auto">
                  {selectedLineage.directiveSticky?.length || 0}
                </Badge>
              </div>
              
              {selectedLineage.directiveSticky?.map((directive, index) => (
                <div key={index} className="bg-blue-50 rounded-lg p-3 relative group">
                  <p className="text-sm text-gray-700 pr-6">{directive}</p>
                  <button
                    onClick={() => removeDirective(selectedLineage.id, 'sticky', index)}
                    className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}

              <div className="space-y-2">
                <Textarea
                  value={stickyInput}
                  onChange={(e) => setStickyInput(e.target.value)}
                  placeholder="Add a persistent directive..."
                  rows={2}
                  className="text-sm"
                />
                <Button
                  size="sm"
                  onClick={handleAddSticky}
                  disabled={!stickyInput.trim()}
                  className="w-full"
                >
                  <Plus className="w-3 h-3 mr-1" /> Add Sticky Directive
                </Button>
              </div>
            </div>

            <div className="h-px bg-gray-100 my-4" />

            {/* One-shot Directives */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-600" />
                <h4 className="text-sm font-medium text-gray-700">One-shot Directives</h4>
                <Badge variant="secondary" className="ml-auto">
                  {selectedLineage.directiveOneshot?.length || 0}
                </Badge>
              </div>

              {selectedLineage.directiveOneshot?.map((directive, index) => (
                <div key={index} className="bg-yellow-50 rounded-lg p-3 relative group">
                  <p className="text-sm text-gray-700 pr-6">{directive}</p>
                  <button
                    onClick={() => removeDirective(selectedLineage.id, 'oneshot', index)}
                    className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}

              <div className="space-y-2">
                <Textarea
                  value={oneshotInput}
                  onChange={(e) => setOneshotInput(e.target.value)}
                  placeholder="Add a one-time directive..."
                  rows={2}
                  className="text-sm"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleAddOneshot}
                  disabled={!oneshotInput.trim()}
                  className="w-full"
                >
                  <Plus className="w-3 h-3 mr-1" /> Add One-shot Directive
                </Button>
              </div>
              <p className="text-xs text-gray-500 text-center">
                One-shot directives are cleared after the next regeneration
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
