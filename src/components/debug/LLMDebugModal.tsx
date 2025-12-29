import { X, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../ui';
import type { LLMDebugEntry } from '../../types/llm-debug';
import { cn } from '../../utils/cn';

interface LLMDebugModalProps {
  entry: LLMDebugEntry;
  onClose: () => void;
}

export function LLMDebugModal({ entry, onClose }: LLMDebugModalProps) {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const copyToClipboard = async (text: string, section: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  // Format duration
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  // Format timestamp
  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">LLM Call Details</h2>
            <Badge variant={entry.status === 'success' ? 'success' : 'danger'}>
              {entry.status.toUpperCase()}
            </Badge>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Meta info */}
          <div className="flex flex-wrap gap-4 text-sm text-gray-600">
            <div>
              <span className="font-medium">Timestamp:</span>{' '}
              {formatTimestamp(entry.timestamp)}
            </div>
            <div>
              <span className="font-medium">Duration:</span>{' '}
              {formatDuration(entry.durationMs)}
            </div>
            {entry.sessionId && (
              <div>
                <span className="font-medium">Session:</span>{' '}
                <code className="text-xs bg-gray-100 px-1 rounded">{entry.sessionId}</code>
              </div>
            )}
          </div>

          {/* Request section */}
          <div className="border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between bg-gray-50 px-4 py-2 border-b">
              <h3 className="font-medium text-gray-700">Request</h3>
              <button
                onClick={() => copyToClipboard(JSON.stringify(entry.request, null, 2), 'request')}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                {copiedSection === 'request' ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy JSON
                  </>
                )}
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex flex-wrap gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-600">Model:</span>{' '}
                  <code className="bg-gray-100 px-1 rounded">{entry.request.model}</code>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Temperature:</span>{' '}
                  {entry.request.temperature}
                </div>
                <div>
                  <span className="font-medium text-gray-600">Max Tokens:</span>{' '}
                  {entry.request.maxTokens}
                </div>
              </div>

              <div>
                <h4 className="font-medium text-gray-600 text-sm mb-2">Messages:</h4>
                <div className="space-y-2 max-h-48 overflow-auto">
                  {entry.request.messages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        'rounded p-2 text-sm',
                        msg.role === 'system' && 'bg-purple-50 border-l-2 border-purple-400',
                        msg.role === 'user' && 'bg-blue-50 border-l-2 border-blue-400',
                        msg.role === 'assistant' && 'bg-green-50 border-l-2 border-green-400'
                      )}
                    >
                      <span className="font-medium text-xs uppercase text-gray-500">
                        [{msg.role}]
                      </span>
                      <pre className="whitespace-pre-wrap font-mono text-xs mt-1">
                        {msg.content}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Response section (if success) */}
          {entry.response && (
            <div className="border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between bg-green-50 px-4 py-2 border-b">
                <h3 className="font-medium text-green-700">Response</h3>
                <button
                  onClick={() =>
                    copyToClipboard(JSON.stringify(entry.response, null, 2), 'response')
                  }
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {copiedSection === 'response' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy JSON
                    </>
                  )}
                </button>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex flex-wrap gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-600">Model:</span>{' '}
                    <code className="bg-gray-100 px-1 rounded">{entry.response.model}</code>
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">Finish Reason:</span>{' '}
                    {entry.response.finishReason}
                  </div>
                </div>

                {entry.usage && (
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-600">Prompt Tokens:</span>{' '}
                      {entry.usage.promptTokens.toLocaleString()}
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Completion Tokens:</span>{' '}
                      {entry.usage.completionTokens.toLocaleString()}
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Total:</span>{' '}
                      {entry.usage.totalTokens.toLocaleString()}
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="font-medium text-gray-600 text-sm mb-2">Content:</h4>
                  <div className="bg-gray-50 rounded p-3 max-h-64 overflow-auto">
                    <pre className="whitespace-pre-wrap font-mono text-xs">
                      {entry.response.content}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Error section (if error) */}
          {entry.error && (
            <div className="border border-red-200 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between bg-red-50 px-4 py-2 border-b border-red-200">
                <h3 className="font-medium text-red-700">Error</h3>
                <button
                  onClick={() =>
                    copyToClipboard(JSON.stringify(entry.error, null, 2), 'error')
                  }
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {copiedSection === 'error' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy Full
                    </>
                  )}
                </button>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex flex-wrap gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-600">Message:</span>{' '}
                    <span className="text-red-600">{entry.error.message}</span>
                  </div>
                  {entry.error.type && (
                    <div>
                      <span className="font-medium text-gray-600">Type:</span>{' '}
                      {entry.error.type}
                    </div>
                  )}
                  {entry.error.code && (
                    <div>
                      <span className="font-medium text-gray-600">Code:</span>{' '}
                      {entry.error.code}
                    </div>
                  )}
                </div>

                {entry.error.rawResponse && (
                  <div>
                    <h4 className="font-medium text-gray-600 text-sm mb-2">Raw Response:</h4>
                    <div className="bg-red-50 rounded p-3 max-h-32 overflow-auto">
                      <pre className="whitespace-pre-wrap font-mono text-xs text-red-700">
                        {entry.error.rawResponse}
                      </pre>
                    </div>
                  </div>
                )}

                {entry.error.stack && (
                  <div>
                    <h4 className="font-medium text-gray-600 text-sm mb-2">Stack Trace:</h4>
                    <div className="bg-gray-100 rounded p-3 max-h-32 overflow-auto">
                      <pre className="whitespace-pre-wrap font-mono text-xs text-gray-600">
                        {entry.error.stack}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-4 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
