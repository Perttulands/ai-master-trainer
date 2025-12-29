import { useState } from 'react';
import { Trash2, Filter } from 'lucide-react';
import { Badge } from '../ui';
import { LLMDebugEntryCard } from './LLMDebugEntryCard';
import { LLMDebugModal } from './LLMDebugModal';
import type { LLMDebugEntry, LLMDebugFilter } from '../../types/llm-debug';

interface LLMDebugPanelProps {
  entries: LLMDebugEntry[];
  onClear: () => void;
}

export function LLMDebugPanel({ entries, onClear }: LLMDebugPanelProps) {
  const [filter, setFilter] = useState<LLMDebugFilter>('all');
  const [selectedEntry, setSelectedEntry] = useState<LLMDebugEntry | null>(null);

  // Filter entries
  const filteredEntries = entries.filter((entry) => {
    if (filter === 'all') return true;
    return entry.status === filter;
  });

  // Count by status
  const successCount = entries.filter((e) => e.status === 'success').length;
  const errorCount = entries.filter((e) => e.status === 'error').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">LLM Debug Log</h2>
        {entries.length > 0 && (
          <button
            onClick={onClear}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Clear All
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as LLMDebugFilter)}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">All ({entries.length})</option>
            <option value="success">Success ({successCount})</option>
            <option value="error">Errors ({errorCount})</option>
          </select>
        </div>
        <Badge variant="default">{filteredEntries.length} entries</Badge>
      </div>

      {/* Entries list */}
      {filteredEntries.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          {entries.length === 0 ? (
            <>
              <p className="font-medium">No LLM calls recorded yet</p>
              <p className="text-sm mt-1">Debug entries will appear here when agents are executed</p>
            </>
          ) : (
            <p>No entries match the current filter</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredEntries.map((entry) => (
            <LLMDebugEntryCard
              key={entry.id}
              entry={entry}
              onViewDetails={setSelectedEntry}
            />
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selectedEntry && (
        <LLMDebugModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
      )}
    </div>
  );
}
