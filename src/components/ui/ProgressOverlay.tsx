/**
 * Progress Overlay Component
 *
 * Displays real-time progress during multi-step operations like
 * agent creation and evolution.
 */

import { useState } from "react";
import { Check, X, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { useProgressStore } from "../../store/progress";
import type { ProgressItem } from "../../types/progress";

const ERROR_PREVIEW_LENGTH = 150;

function truncateError(error: string): { preview: string; isTruncated: boolean } {
  if (error.length <= ERROR_PREVIEW_LENGTH) {
    return { preview: error, isTruncated: false };
  }
  return { preview: error.slice(0, ERROR_PREVIEW_LENGTH) + "...", isTruncated: true };
}

function StatusIcon({ status }: { status: ProgressItem["status"] }) {
  switch (status) {
    case "pending":
      return <div className="w-4 h-4 rounded-full border-2 border-gray-300" />;
    case "in_progress":
      return (
        <div className="w-4 h-4 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
      );
    case "completed":
      return <Check className="w-4 h-4 text-green-500" />;
    case "error":
      return <X className="w-4 h-4 text-red-500" />;
  }
}

function getItemStageLabel(stage: ProgressItem["stage"]): string {
  switch (stage) {
    case "generating_agents":
      return "Creating...";
    case "executing_agents":
      return "Running...";
    case "analyzing_reward":
      return "Analyzing...";
    case "assigning_credit":
      return "Assigning credit...";
    case "getting_history":
      return "Loading history...";
    case "planning_evolution":
      return "Planning...";
    case "applying_evolution":
      return "Evolving...";
    case "recording_evolution":
      return "Recording...";
    case "executing_evolved":
      return "Testing...";
    case "complete":
      return "Done";
    default:
      return "";
  }
}

export function ProgressOverlay() {
  const operation = useProgressStore((state) => state.currentOperation);
  const clearOperation = useProgressStore((state) => state.clearOperation);
  const [isErrorExpanded, setIsErrorExpanded] = useState(false);

  if (!operation) return null;

  const percentComplete =
    operation.totalItems > 0
      ? Math.round((operation.completedItems / operation.totalItems) * 100)
      : 0;

  const hasError = operation.error || operation.items.some((i) => i.status === "error");
  const errorInfo = operation.error ? truncateError(operation.error) : null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
        <div className="space-y-4">
          {/* Stage indicator */}
          <div className="text-center">
            <div
              className={`w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center ${
                hasError ? "bg-red-100" : "bg-primary-100"
              }`}
            >
              {hasError ? (
                <X className="w-6 h-6 text-red-600" />
              ) : operation.currentStage === "complete" ? (
                <Check className="w-6 h-6 text-green-600" />
              ) : (
                <RefreshCw className="w-6 h-6 text-primary-600 animate-spin" />
              )}
            </div>
            <h3 className="font-semibold text-gray-900">{operation.stageLabel}</h3>
            <p className="text-sm text-gray-500 mt-1">
              {operation.completedItems} of {operation.totalItems} complete
            </p>
          </div>

          {/* Progress bar */}
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                hasError ? "bg-red-500" : "bg-primary-600"
              }`}
              style={{ width: `${percentComplete}%` }}
            />
          </div>

          {/* Item list */}
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {operation.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-gray-50"
              >
                <StatusIcon status={item.status} />
                <span className="text-sm font-medium text-gray-700 flex-1">
                  {item.label}
                </span>
                {item.status === "in_progress" && (
                  <span className="text-xs text-gray-500">
                    {getItemStageLabel(item.stage)}
                  </span>
                )}
                {item.status === "error" && item.error && (
                  <span className="text-xs text-red-500 truncate max-w-32">
                    {item.error}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Error message */}
          {operation.error && errorInfo && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className={isErrorExpanded ? "max-h-48 overflow-y-auto" : ""}>
                <p className="text-sm text-red-700 break-words">
                  {isErrorExpanded ? operation.error : errorInfo.preview}
                </p>
              </div>
              {errorInfo.isTruncated && (
                <button
                  onClick={() => setIsErrorExpanded(!isErrorExpanded)}
                  className="flex items-center gap-1 mt-2 text-xs text-red-600 hover:text-red-800 font-medium"
                >
                  {isErrorExpanded ? (
                    <>
                      <ChevronUp className="w-3 h-3" />
                      Show less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3 h-3" />
                      Show full error
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Dismiss button when there's an error */}
          {hasError && (
            <button
              onClick={clearOperation}
              className="w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
