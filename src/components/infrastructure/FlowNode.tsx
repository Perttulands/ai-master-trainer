import { memo, useCallback } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import {
  Wrench,
  Play,
  MessageSquare,
  GitBranch,
  Repeat,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import type { AgentFlowStep } from '../../types/agent';

type FlowNodeData = {
  step: AgentFlowStep;
  isSelected?: boolean;
  onSelect?: (stepId: string) => void;
};

interface NodeStyleConfig {
  bg: string;
  bgHover: string;
  border: string;
  borderSelected: string;
  text: string;
  icon: string;
  glow: string;
  gradient: string;
}

const nodeStyles: Record<AgentFlowStep['type'] | 'error', NodeStyleConfig> = {
  start: {
    bg: 'bg-gradient-to-br from-emerald-50 to-green-100',
    bgHover: 'hover:from-emerald-100 hover:to-green-200',
    border: 'border-emerald-400',
    borderSelected: 'ring-2 ring-emerald-500 ring-offset-2',
    text: 'text-emerald-800',
    icon: 'text-emerald-600',
    glow: 'shadow-emerald-200',
    gradient: 'from-emerald-500 to-green-500',
  },
  prompt: {
    bg: 'bg-gradient-to-br from-blue-50 to-indigo-100',
    bgHover: 'hover:from-blue-100 hover:to-indigo-200',
    border: 'border-blue-400',
    borderSelected: 'ring-2 ring-blue-500 ring-offset-2',
    text: 'text-blue-800',
    icon: 'text-blue-600',
    glow: 'shadow-blue-200',
    gradient: 'from-blue-500 to-indigo-500',
  },
  tool: {
    bg: 'bg-gradient-to-br from-violet-50 to-purple-100',
    bgHover: 'hover:from-violet-100 hover:to-purple-200',
    border: 'border-violet-400',
    borderSelected: 'ring-2 ring-violet-500 ring-offset-2',
    text: 'text-violet-800',
    icon: 'text-violet-600',
    glow: 'shadow-violet-200',
    gradient: 'from-violet-500 to-purple-500',
  },
  condition: {
    bg: 'bg-gradient-to-br from-amber-50 to-orange-100',
    bgHover: 'hover:from-amber-100 hover:to-orange-200',
    border: 'border-amber-400',
    borderSelected: 'ring-2 ring-amber-500 ring-offset-2',
    text: 'text-amber-800',
    icon: 'text-amber-600',
    glow: 'shadow-amber-200',
    gradient: 'from-amber-500 to-orange-500',
  },
  loop: {
    bg: 'bg-gradient-to-br from-cyan-50 to-teal-100',
    bgHover: 'hover:from-cyan-100 hover:to-teal-200',
    border: 'border-cyan-400',
    borderSelected: 'ring-2 ring-cyan-500 ring-offset-2',
    text: 'text-cyan-800',
    icon: 'text-cyan-600',
    glow: 'shadow-cyan-200',
    gradient: 'from-cyan-500 to-teal-500',
  },
  output: {
    bg: 'bg-gradient-to-br from-green-50 to-emerald-100',
    bgHover: 'hover:from-green-100 hover:to-emerald-200',
    border: 'border-green-400',
    borderSelected: 'ring-2 ring-green-500 ring-offset-2',
    text: 'text-green-800',
    icon: 'text-green-600',
    glow: 'shadow-green-200',
    gradient: 'from-green-500 to-emerald-500',
  },
  error: {
    bg: 'bg-gradient-to-br from-red-50 to-rose-100',
    bgHover: 'hover:from-red-100 hover:to-rose-200',
    border: 'border-red-400',
    borderSelected: 'ring-2 ring-red-500 ring-offset-2',
    text: 'text-red-800',
    icon: 'text-red-600',
    glow: 'shadow-red-200',
    gradient: 'from-red-500 to-rose-500',
  },
};

const nodeIcons: Record<AgentFlowStep['type'] | 'error', React.ComponentType<{ className?: string }>> = {
  start: Play,
  prompt: MessageSquare,
  tool: Wrench,
  condition: GitBranch,
  loop: Repeat,
  output: CheckCircle,
  error: AlertTriangle,
};

function FlowNodeComponent({ data }: NodeProps<FlowNodeData>) {
  const { step, isSelected, onSelect } = data;
  const style = nodeStyles[step.type];
  const Icon = nodeIcons[step.type];
  const isCondition = step.type === 'condition';

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect?.(step.id);
    },
    [onSelect, step.id]
  );

  // Get a short description from config if available
  const getDescription = (): string | null => {
    const config = step.config as Record<string, unknown>;
    if (config.template && typeof config.template === 'string') {
      return config.template.slice(0, 40) + (config.template.length > 40 ? '...' : '');
    }
    if (config.toolName && typeof config.toolName === 'string') {
      return config.toolName;
    }
    if (config.condition && typeof config.condition === 'string') {
      return config.condition.slice(0, 30) + (config.condition.length > 30 ? '...' : '');
    }
    return null;
  };

  const description = getDescription();

  return (
    <>
      {/* Input handle - not on start node */}
      {step.type !== 'start' && (
        <Handle
          type="target"
          position={Position.Left}
          className={cn(
            'w-3 h-3 !border-2 !bg-white transition-all',
            style.border,
            isSelected && '!w-4 !h-4'
          )}
        />
      )}

      {/* Node content */}
      <div
        onClick={handleClick}
        className={cn(
          'relative border-2 shadow-lg transition-all duration-200 cursor-pointer group',
          'backdrop-blur-sm',
          style.bg,
          style.bgHover,
          style.border,
          isSelected ? style.borderSelected : '',
          isSelected && `shadow-lg ${style.glow}`,
          !isSelected && 'hover:shadow-xl hover:-translate-y-0.5',
          isCondition ? 'w-24 h-24 rotate-45' : 'min-w-40 px-4 py-3 rounded-xl'
        )}
      >
        {/* Gradient accent bar */}
        {!isCondition && (
          <div
            className={cn(
              'absolute top-0 left-0 right-0 h-1 rounded-t-xl bg-gradient-to-r',
              style.gradient
            )}
          />
        )}

        {isCondition ? (
          // Diamond content - rotated back for readability
          <div className="-rotate-45 flex flex-col items-center justify-center h-full w-full p-2">
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center mb-1',
              'bg-white/50'
            )}>
              <Icon className={cn('w-4 h-4', style.icon)} />
            </div>
            <span className={cn('text-xs font-semibold text-center leading-tight', style.text)}>
              {step.name}
            </span>
          </div>
        ) : (
          // Standard node content
          <div className="pt-1">
            <div className="flex items-center gap-2 mb-1">
              <div className={cn(
                'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0',
                'bg-white/60 shadow-sm'
              )}>
                <Icon className={cn('w-4 h-4', style.icon)} />
              </div>
              <span className={cn('text-sm font-semibold', style.text)}>
                {step.name}
              </span>
            </div>
            {description && (
              <p className={cn(
                'text-xs mt-1 opacity-70 font-mono leading-tight',
                style.text
              )}>
                {description}
              </p>
            )}
          </div>
        )}

        {/* Selection indicator */}
        {isSelected && (
          <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-primary-500 border-2 border-white shadow-sm animate-pulse" />
        )}
      </div>

      {/* Output handles */}
      {step.type === 'condition' ? (
        <>
          {/* True branch - right */}
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            className={cn(
              'w-3 h-3 !border-2 !bg-green-100 !border-green-500',
              isSelected && '!w-4 !h-4'
            )}
          />
          {/* False branch - bottom */}
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            className={cn(
              'w-3 h-3 !border-2 !bg-red-100 !border-red-500',
              isSelected && '!w-4 !h-4'
            )}
          />
        </>
      ) : step.type !== 'output' ? (
        // Standard output handle - not on output node
        <Handle
          type="source"
          position={Position.Right}
          className={cn(
            'w-3 h-3 !border-2 !bg-white transition-all',
            style.border,
            isSelected && '!w-4 !h-4'
          )}
        />
      ) : null}

      {/* Error handle for nodes that can fail */}
      {(step.type === 'tool' || step.type === 'prompt') && (
        <Handle
          type="source"
          position={Position.Bottom}
          id="error"
          className="w-2 h-2 !border-2 !bg-orange-100 !border-orange-400"
        />
      )}
    </>
  );
}

export const FlowNode = memo(FlowNodeComponent);
FlowNode.displayName = 'FlowNode';
