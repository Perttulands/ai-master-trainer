import { Check, X, Zap } from 'lucide-react';
import { Button } from '../ui';
import type { TrainerAction } from '../../types';
import { cn } from '../../utils/cn';

interface ActionProposalCardProps {
  actions: TrainerAction[];
  onApply: (actions: TrainerAction[]) => void;
  onDiscard: () => void;
  isApplying?: boolean;
}

export function ActionProposalCard({ actions, onApply, onDiscard, isApplying }: ActionProposalCardProps) {
  if (actions.length === 0) return null;

  return (
    <div className="mt-3 p-3 bg-primary-50 border border-primary-200 rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <Zap className="w-4 h-4 text-primary-600" />
        <span className="text-sm font-medium text-primary-900">Proposed Actions</span>
      </div>

      <ul className="space-y-1.5 mb-3">
        {actions.map((action, index) => (
          <li key={index} className="text-sm text-primary-800 flex items-start gap-2">
            <span className="text-primary-400 mt-0.5">•</span>
            <span>{formatAction(action)}</span>
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => onApply(actions)}
          disabled={isApplying}
          className="flex-1"
        >
          <Check className={cn('w-3 h-3 mr-1', isApplying && 'animate-spin')} />
          {isApplying ? 'Applying...' : 'Apply'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDiscard}
          disabled={isApplying}
        >
          <X className="w-3 h-3 mr-1" />
          Discard
        </Button>
      </div>
    </div>
  );
}

function formatAction(action: TrainerAction): string {
  switch (action.kind) {
    case 'set_grade':
      return `Set Agent ${action.agentLabel} score to ${action.grade}/10`;
    case 'add_comment':
      return `Add comment to Agent ${action.agentLabel}: "${action.comment}"`;
    case 'set_directive':
      return `Set ${action.directive.type} directive for Agent ${action.agentLabel}: "${action.directive.content}"`;
    case 'add_lineage':
      return `Add ${action.count} new agent${action.count > 1 ? 's' : ''} to the session`;
    default:
      return 'Unknown action';
  }
}
