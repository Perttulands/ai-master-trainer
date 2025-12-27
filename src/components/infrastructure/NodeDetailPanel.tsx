import { X, Copy, Check, Wrench, MessageSquare, GitBranch, Repeat, CheckCircle, Play, Code, Settings } from 'lucide-react';
import { useState, useCallback } from 'react';
import { cn } from '../../utils/cn';
import type { AgentFlowStep } from '../../types/agent';

interface NodeDetailPanelProps {
  step: AgentFlowStep;
  onClose: () => void;
  className?: string;
}

const typeLabels: Record<AgentFlowStep['type'], string> = {
  start: 'Start Node',
  prompt: 'Prompt Node',
  tool: 'Tool Node',
  condition: 'Condition Node',
  loop: 'Loop Node',
  output: 'Output Node',
};

const typeDescriptions: Record<AgentFlowStep['type'], string> = {
  start: 'Entry point of the agent flow. Initializes the execution context.',
  prompt: 'Processes input using a language model with the configured prompt template.',
  tool: 'Executes an external tool or function with the specified parameters.',
  condition: 'Evaluates a condition and branches the flow based on the result.',
  loop: 'Iterates over the flow until a condition is met or max iterations reached.',
  output: 'Generates the final output in the specified format.',
};

const typeIcons: Record<AgentFlowStep['type'], React.ComponentType<{ className?: string }>> = {
  start: Play,
  prompt: MessageSquare,
  tool: Wrench,
  condition: GitBranch,
  loop: Repeat,
  output: CheckCircle,
};

const typeColors: Record<AgentFlowStep['type'], { bg: string; text: string; accent: string }> = {
  start: { bg: 'bg-emerald-50', text: 'text-emerald-700', accent: 'bg-emerald-500' },
  prompt: { bg: 'bg-blue-50', text: 'text-blue-700', accent: 'bg-blue-500' },
  tool: { bg: 'bg-violet-50', text: 'text-violet-700', accent: 'bg-violet-500' },
  condition: { bg: 'bg-amber-50', text: 'text-amber-700', accent: 'bg-amber-500' },
  loop: { bg: 'bg-cyan-50', text: 'text-cyan-700', accent: 'bg-cyan-500' },
  output: { bg: 'bg-green-50', text: 'text-green-700', accent: 'bg-green-500' },
};

export function NodeDetailPanel({ step, onClose, className }: NodeDetailPanelProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const Icon = typeIcons[step.type];
  const colors = typeColors[step.type];
  const config = step.config as Record<string, unknown>;

  const handleCopy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }, []);

  const renderConfigValue = (key: string, value: unknown): React.ReactNode => {
    if (typeof value === 'string') {
      return (
        <div className="relative group">
          <pre className={cn(
            'text-xs font-mono bg-gray-900 text-gray-100 rounded-lg p-3 overflow-x-auto',
            'border border-gray-700'
          )}>
            <code>{value}</code>
          </pre>
          <button
            onClick={() => handleCopy(value, key)}
            className={cn(
              'absolute top-2 right-2 p-1.5 rounded-md transition-all',
              'bg-gray-700 hover:bg-gray-600 text-gray-300',
              'opacity-0 group-hover:opacity-100'
            )}
            title="Copy"
          >
            {copiedKey === key ? (
              <Check className="w-3.5 h-3.5 text-green-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      );
    }

    if (typeof value === 'object' && value !== null) {
      const jsonStr = JSON.stringify(value, null, 2);
      return (
        <div className="relative group">
          <pre className={cn(
            'text-xs font-mono bg-gray-900 text-gray-100 rounded-lg p-3 overflow-x-auto',
            'border border-gray-700 max-h-48'
          )}>
            <code>{jsonStr}</code>
          </pre>
          <button
            onClick={() => handleCopy(jsonStr, key)}
            className={cn(
              'absolute top-2 right-2 p-1.5 rounded-md transition-all',
              'bg-gray-700 hover:bg-gray-600 text-gray-300',
              'opacity-0 group-hover:opacity-100'
            )}
            title="Copy"
          >
            {copiedKey === key ? (
              <Check className="w-3.5 h-3.5 text-green-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      );
    }

    return (
      <span className="text-sm font-medium text-gray-900">
        {String(value)}
      </span>
    );
  };

  const renderConnections = () => {
    const { connections } = step;
    const entries = Object.entries(connections).filter(([_, v]) => v);

    if (entries.length === 0) {
      return (
        <p className="text-sm text-gray-500 italic">No outgoing connections</p>
      );
    }

    return (
      <div className="space-y-2">
        {entries.map(([type, targetId]) => (
          <div
            key={type}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
              type === 'next' && 'bg-gray-100',
              type === 'onTrue' && 'bg-green-50',
              type === 'onFalse' && 'bg-red-50',
              type === 'onError' && 'bg-orange-50'
            )}
          >
            <div className={cn(
              'w-2 h-2 rounded-full',
              type === 'next' && 'bg-gray-500',
              type === 'onTrue' && 'bg-green-500',
              type === 'onFalse' && 'bg-red-500',
              type === 'onError' && 'bg-orange-500'
            )} />
            <span className="font-medium">
              {type === 'next' && 'Next'}
              {type === 'onTrue' && 'On True'}
              {type === 'onFalse' && 'On False'}
              {type === 'onError' && 'On Error'}
            </span>
            <span className="text-gray-500">&rarr;</span>
            <code className="text-xs bg-white px-2 py-0.5 rounded border border-gray-200">
              {targetId}
            </code>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={cn(
      'w-80 bg-white border-l border-gray-200 flex flex-col h-full shadow-xl',
      'animate-in slide-in-from-right duration-200',
      className
    )}>
      {/* Header */}
      <div className={cn('px-4 py-4 border-b border-gray-200', colors.bg)}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center',
              colors.accent
            )}>
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{step.name}</h3>
              <p className={cn('text-xs font-medium', colors.text)}>
                {typeLabels[step.type]}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/50 text-gray-500 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Description */}
        <section>
          <p className="text-sm text-gray-600 leading-relaxed">
            {typeDescriptions[step.type]}
          </p>
        </section>

        {/* Node ID */}
        <section>
          <h4 className="text-xs font-semibold uppercase text-gray-400 mb-2 flex items-center gap-2">
            <Settings className="w-3.5 h-3.5" />
            Node ID
          </h4>
          <code className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-700">
            {step.id}
          </code>
        </section>

        {/* Configuration */}
        {Object.keys(config).length > 0 && (
          <section>
            <h4 className="text-xs font-semibold uppercase text-gray-400 mb-3 flex items-center gap-2">
              <Code className="w-3.5 h-3.5" />
              Configuration
            </h4>
            <div className="space-y-4">
              {Object.entries(config).map(([key, value]) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5 capitalize">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </label>
                  {renderConfigValue(key, value)}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Connections */}
        <section>
          <h4 className="text-xs font-semibold uppercase text-gray-400 mb-3 flex items-center gap-2">
            <GitBranch className="w-3.5 h-3.5" />
            Connections
          </h4>
          {renderConnections()}
        </section>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
        <p className="text-xs text-gray-500 text-center">
          Click elsewhere to deselect
        </p>
      </div>
    </div>
  );
}
