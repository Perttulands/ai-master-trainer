import { Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Card, CardContent, Badge } from '../ui';
import type { LLMDebugEntry } from '../../types/llm-debug';
import { cn } from '../../utils/cn';

interface LLMDebugEntryCardProps {
  entry: LLMDebugEntry;
  onViewDetails: (entry: LLMDebugEntry) => void;
}

// Extract text from content that may be string or array of content blocks
function getContentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === 'string') return block;
        if (block && typeof block === 'object' && 'text' in block) return block.text;
        return '';
      })
      .join('');
  }
  return '';
}

export function LLMDebugEntryCard({ entry, onViewDetails }: LLMDebugEntryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Get first user message for preview
  const userMessage = entry.request.messages.find((m) => m.role === 'user');
  const contentText = userMessage ? getContentText(userMessage.content) : '';
  const preview = contentText.slice(0, 100) || 'No user message';

  // Format duration
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  // Format model name (remove provider prefix for display)
  const formatModel = (model: string) => {
    const parts = model.split('/');
    return parts.length > 1 ? parts[1] : model;
  };

  // Format timestamp
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <Card className={cn(entry.status === 'error' && 'border-red-200')}>
      <CardContent className="p-3">
        {/* Header row */}
        <div className="flex items-center gap-3">
          {/* Status indicator */}
          <div
            className={cn(
              'w-2.5 h-2.5 rounded-full flex-shrink-0',
              entry.status === 'success' ? 'bg-green-500' : 'bg-red-500'
            )}
          />

          {/* Timestamp */}
          <span className="text-xs text-gray-400 flex items-center gap-1 flex-shrink-0">
            <Clock className="w-3 h-3" />
            {formatTime(entry.timestamp)}
          </span>

          {/* Model */}
          <Badge variant="default" className="flex-shrink-0">
            {formatModel(entry.request.model)}
          </Badge>

          {/* Duration */}
          <span className="text-xs text-gray-500 flex-shrink-0">
            {formatDuration(entry.durationMs)}
          </span>

          {/* Token usage or error */}
          {entry.status === 'success' && entry.usage ? (
            <span className="text-xs text-gray-400 flex-shrink-0">
              {entry.usage.totalTokens.toLocaleString()} tokens
            </span>
          ) : entry.status === 'error' ? (
            <Badge variant="danger" className="flex-shrink-0">
              ERROR
            </Badge>
          ) : null}

          {/* Expand button */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="ml-auto p-1 hover:bg-gray-100 rounded transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )}
          </button>
        </div>

        {/* Preview (always visible) */}
        <div className="mt-2 text-sm text-gray-600 truncate pl-5">
          "{preview}
          {contentText.length > 100 && '...'}"
        </div>

        {/* Error message (if error) */}
        {entry.status === 'error' && entry.error && (
          <div className="mt-2 text-sm text-red-600 pl-5">
            {entry.error.message}
          </div>
        )}

        {/* Expanded details */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            {/* Messages summary */}
            <div className="text-xs text-gray-500 mb-2">
              {entry.request.messages.length} message(s) | Temp: {entry.request.temperature} | Max: {entry.request.maxTokens}
            </div>

            {/* Response preview */}
            {entry.response && (
              <div className="bg-gray-50 rounded p-2 text-xs text-gray-700 max-h-32 overflow-auto">
                <pre className="whitespace-pre-wrap font-mono">
                  {entry.response.content.slice(0, 300)}
                  {entry.response.content.length > 300 && '...'}
                </pre>
              </div>
            )}

            {/* Error details */}
            {entry.error && (
              <div className="bg-red-50 rounded p-2 text-xs text-red-700 max-h-32 overflow-auto">
                <pre className="whitespace-pre-wrap font-mono">
                  {entry.error.rawResponse || entry.error.message}
                </pre>
              </div>
            )}

            {/* View details button */}
            <button
              onClick={() => onViewDetails(entry)}
              className="mt-2 text-xs text-primary-600 hover:text-primary-700 font-medium"
            >
              View Full Details
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
