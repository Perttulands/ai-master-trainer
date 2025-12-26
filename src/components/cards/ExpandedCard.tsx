import { Copy, Lock, Unlock, X } from 'lucide-react';
import { Modal, Badge, Button, ScoreSlider, Textarea } from '../ui';
import { cn } from '../../utils/cn';
import type { LineageWithArtifact } from '../../types';
import { useLineageStore } from '../../store/lineages';
import { useState } from 'react';

interface ExpandedCardProps {
  lineage: LineageWithArtifact;
  onClose: () => void;
}

export function ExpandedCard({ lineage, onClose }: ExpandedCardProps) {
  const { toggleLock, setScore, setComment } = useLineageStore();
  const [copied, setCopied] = useState(false);
  const [localComment, setLocalComment] = useState(lineage.currentEvaluation?.comment || '');

  const handleCopy = async () => {
    if (lineage.currentArtifact) {
      await navigator.clipboard.writeText(lineage.currentArtifact.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCommentBlur = () => {
    if (localComment !== lineage.currentEvaluation?.comment) {
      setComment(lineage.id, localComment);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} size="xl">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center font-bold text-white text-lg',
                lineage.label === 'A' && 'bg-blue-500',
                lineage.label === 'B' && 'bg-purple-500',
                lineage.label === 'C' && 'bg-orange-500',
                lineage.label === 'D' && 'bg-teal-500'
              )}
            >
              {lineage.label}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-gray-900">Lineage {lineage.label}</h3>
                {lineage.strategyTag && (
                  <Badge variant="default">{lineage.strategyTag}</Badge>
                )}
              </div>
              <p className="text-sm text-gray-500">Cycle {lineage.cycle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
            >
              <Copy className="w-4 h-4 mr-1" />
              {copied ? 'Copied!' : 'Copy'}
            </Button>
            <Button
              variant={lineage.isLocked ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => toggleLock(lineage.id)}
            >
              {lineage.isLocked ? (
                <>
                  <Lock className="w-4 h-4 mr-1" />
                  Locked
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4 mr-1" />
                  Lock
                </>
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-gray-50 rounded-lg p-4 mb-4">
          <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono">
            {lineage.currentArtifact?.content || 'No content'}
          </pre>
        </div>

        {/* Evaluation */}
        {!lineage.isLocked && (
          <div className="space-y-4 border-t border-gray-100 pt-4">
            <ScoreSlider
              value={lineage.currentEvaluation?.score ?? null}
              onChange={(score) => setScore(lineage.id, score)}
            />
            <Textarea
              label="Comment (optional)"
              placeholder="Add feedback for this artifact..."
              value={localComment}
              onChange={(e) => setLocalComment(e.target.value)}
              onBlur={handleCommentBlur}
              rows={3}
            />
          </div>
        )}

        {/* Locked state */}
        {lineage.isLocked && lineage.currentEvaluation && (
          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Final Score:</span>
              <span className="text-2xl font-bold text-green-600">
                {lineage.currentEvaluation.score}/10
              </span>
            </div>
            {lineage.currentEvaluation.comment && (
              <p className="mt-2 text-sm text-gray-600 italic">
                "{lineage.currentEvaluation.comment}"
              </p>
            )}
          </div>
        )}

        {/* Metadata */}
        {lineage.currentArtifact?.metadata && (
          <details className="mt-4">
            <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
              View metadata
            </summary>
            <pre className="mt-2 text-xs bg-gray-100 rounded p-2 overflow-auto">
              {JSON.stringify(lineage.currentArtifact.metadata, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </Modal>
  );
}
