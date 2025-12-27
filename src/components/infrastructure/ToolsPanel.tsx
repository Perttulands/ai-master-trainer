import { useState } from 'react';
import { ChevronDown, ChevronRight, Wrench, Code, Globe } from 'lucide-react';
import type { AgentTool } from '../../types/agent';
import { Badge } from '../ui/Badge';
import { cn } from '../../utils/cn';

interface ToolsPanelProps {
  tools: AgentTool[];
  className?: string;
}

const toolTypeIcons: Record<AgentTool['type'], React.ComponentType<{ className?: string }>> = {
  builtin: Wrench,
  function: Code,
  api: Globe,
};

const toolTypeVariants: Record<AgentTool['type'], 'primary' | 'success' | 'warning'> = {
  builtin: 'primary',
  function: 'success',
  api: 'warning',
};

interface ToolItemProps {
  tool: AgentTool;
}

function ToolItem({ tool }: ToolItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const Icon = toolTypeIcons[tool.type];
  const badgeVariant = toolTypeVariants[tool.type];

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex-shrink-0 text-gray-400">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </div>
        <Icon className="w-5 h-5 text-gray-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 truncate">{tool.name}</span>
            <Badge variant={badgeVariant}>{tool.type}</Badge>
          </div>
          <p className="text-sm text-gray-500 truncate">{tool.description}</p>
        </div>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 pt-0 border-t border-gray-100 bg-gray-50">
          {tool.parameters.length > 0 ? (
            <div className="mt-3 space-y-2">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Parameters
              </h4>
              <div className="space-y-2">
                {tool.parameters.map((param) => (
                  <div
                    key={param.name}
                    className="bg-white rounded-md p-2 border border-gray-100"
                  >
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono text-gray-800">{param.name}</code>
                      <Badge variant="default">{param.type}</Badge>
                      {param.required && <Badge variant="danger">required</Badge>}
                    </div>
                    {param.description && (
                      <p className="mt-1 text-xs text-gray-500">{param.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-gray-400 italic">No parameters</p>
          )}
        </div>
      )}
    </div>
  );
}

export function ToolsPanel({ tools, className }: ToolsPanelProps) {
  if (tools.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center p-8 text-center',
          className
        )}
      >
        <Wrench className="w-12 h-12 text-gray-300 mb-3" />
        <p className="text-gray-500 font-medium">No tools configured</p>
        <p className="text-sm text-gray-400 mt-1">
          Add tools to extend your agent's capabilities
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">
          Tools ({tools.length})
        </h3>
      </div>
      <div className="space-y-2">
        {tools.map((tool) => (
          <ToolItem key={tool.id} tool={tool} />
        ))}
      </div>
    </div>
  );
}
