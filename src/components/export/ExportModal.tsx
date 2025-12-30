import { useState, useMemo, useCallback, useEffect } from 'react';
import { saveAs } from 'file-saver';
import { Check, Copy, Download, FileJson, FileCode, FileType, Activity, Users } from 'lucide-react';
import type { AgentDefinition } from '../../types/agent';
import { Modal } from '../ui/Modal';
import { Button } from '../ui';
import { exportToJson, exportToPython, exportToTypeScript } from '../../lib/export';
import { exportTrainingData } from '../../lib/export/training-data';
import { getTrainingExamplesForExport } from '../../db/training-signal-queries';
import type { TrainingExampleType } from '../../types/training-signal';
import { cn } from '../../utils/cn';

type ExportFormat = 'json' | 'python' | 'typescript';
type ExportType = 'agents' | 'signals';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  agents: { lineageLabel: string; agent: AgentDefinition }[];
  sessionId?: string;
}

interface FormatOption {
  id: ExportFormat;
  label: string;
  icon: typeof FileJson;
  extension: string;
  mimeType: string;
}

const formatOptions: FormatOption[] = [
  { id: 'json', label: 'JSON', icon: FileJson, extension: 'json', mimeType: 'application/json' },
  { id: 'python', label: 'Python', icon: FileCode, extension: 'py', mimeType: 'text/x-python' },
  { id: 'typescript', label: 'TypeScript', icon: FileType, extension: 'ts', mimeType: 'text/typescript' },
];

export function ExportModal({ isOpen, onClose, agents, sessionId }: ExportModalProps) {
  const [exportType, setExportType] = useState<ExportType>('agents');
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(() =>
    new Set(agents.map(a => a.agent.id))
  );
  const [format, setFormat] = useState<ExportFormat>('typescript');
  
  // Signal export state
  const [selectedSignalTypes, setSelectedSignalTypes] = useState<Set<TrainingExampleType>>(
    new Set(['sft', 'preference', 'reward'])
  );
  const [signalContent, setSignalContent] = useState('');

  const [copied, setCopied] = useState(false);

  const toggleAgent = useCallback((agentId: string) => {
    setSelectedAgents(prev => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedAgents(new Set(agents.map(a => a.agent.id)));
  }, [agents]);

  const deselectAll = useCallback(() => {
    setSelectedAgents(new Set());
  }, []);

  const toggleSignalType = useCallback((type: TrainingExampleType) => {
    setSelectedSignalTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  // Load signal content
  useEffect(() => {
    if (exportType === 'signals' && isOpen) {
      // If sessionId is provided, we could filter by it, but getTrainingExamplesForExport currently doesn't support sessionId directly
      // However, getTrainingExamplesForExport filters by timestamp which is usually enough for current session if we had start/end times
      // For now, we'll export all examples matching the types
      const examples = getTrainingExamplesForExport({});
      const filtered = examples.filter(ex => selectedSignalTypes.has(ex.exampleType));
      setSignalContent(exportTrainingData(filtered));
    }
  }, [exportType, isOpen, selectedSignalTypes, sessionId]);

  const exportedContent = useMemo(() => {
    if (exportType === 'signals') {
      return signalContent;
    }

    const selectedAgentsList = agents.filter(a => selectedAgents.has(a.agent.id));

    if (selectedAgentsList.length === 0) {
      return '';
    }

    const exportFn = format === 'json'
      ? exportToJson
      : format === 'python'
        ? exportToPython
        : exportToTypeScript;

    if (selectedAgentsList.length === 1) {
      return exportFn(selectedAgentsList[0].agent);
    }

    // Multiple agents: combine exports
    if (format === 'json') {
      const combined = selectedAgentsList.map(a => JSON.parse(exportToJson(a.agent)));
      return JSON.stringify(combined, null, 2);
    }

    // For Python/TypeScript, add separators between agents
    const separator = format === 'python'
      ? '\n\n# ' + '='.repeat(77) + '\n# END OF AGENT\n# ' + '='.repeat(77) + '\n\n'
      : '\n\n// ' + '='.repeat(75) + '\n// END OF AGENT\n// ' + '='.repeat(75) + '\n\n';

    return selectedAgentsList
      .map(a => exportFn(a.agent))
      .join(separator);
  }, [agents, selectedAgents, format, exportType, signalContent]);

  const handleCopy = useCallback(async () => {
    if (!exportedContent) return;

    try {
      await navigator.clipboard.writeText(exportedContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [exportedContent]);

  const handleDownload = useCallback(() => {
    if (!exportedContent) return;

    if (exportType === 'signals') {
      const blob = new Blob([exportedContent], { type: 'application/jsonl' });
      saveAs(blob, 'training-signals.jsonl');
      return;
    }

    const selectedAgentsList = agents.filter(a => selectedAgents.has(a.agent.id));
    const formatOption = formatOptions.find(f => f.id === format)!;

    const fileName = selectedAgentsList.length === 1
      ? `${selectedAgentsList[0].agent.name.toLowerCase().replace(/\s+/g, '-')}.${formatOption.extension}`
      : `agents-export.${formatOption.extension}`;

    const blob = new Blob([exportedContent], { type: formatOption.mimeType });
    saveAs(blob, fileName);
  }, [exportedContent, agents, selectedAgents, format, exportType]);

  const allSelected = selectedAgents.size === agents.length;
  const noneSelected = exportType === 'agents' 
    ? selectedAgents.size === 0
    : selectedSignalTypes.size === 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export" size="xl">
      <div className="flex flex-col gap-6">
        {/* Export Type Selector */}
        <div className="flex p-1 bg-gray-100 rounded-lg">
          <button
            onClick={() => setExportType('agents')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all',
              exportType === 'agents'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <Users className="w-4 h-4" />
            Agents
          </button>
          <button
            onClick={() => setExportType('signals')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all',
              exportType === 'signals'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <Activity className="w-4 h-4" />
            Training Signals
          </button>
        </div>

        {exportType === 'agents' ? (
          <>
            {/* Agent Selection */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-900">Select Agents</h3>
                <div className="flex gap-2">
                  <button
                    onClick={selectAll}
                    disabled={allSelected}
                    className="text-xs text-primary-600 hover:text-primary-700 disabled:text-gray-400"
                  >
                    Select All
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={deselectAll}
                    disabled={noneSelected}
                    className="text-xs text-primary-600 hover:text-primary-700 disabled:text-gray-400"
                  >
                    Deselect All
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {agents.map(({ lineageLabel, agent }) => (
                  <label
                    key={agent.id}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                      selectedAgents.has(agent.id)
                        ? 'border-primary-200 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedAgents.has(agent.id)}
                      onChange={() => toggleAgent(agent.id)}
                      className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-white bg-gray-700 rounded">
                          {lineageLabel}
                        </span>
                        <span className="font-medium text-gray-900 truncate">{agent.name}</span>
                        <span className="text-xs text-gray-500">v{agent.version}</span>
                      </div>
                      <p className="mt-0.5 text-sm text-gray-500 truncate">{agent.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Format Selection */}
            <div>
              <h3 className="mb-3 text-sm font-medium text-gray-900">Export Format</h3>
              <div className="flex gap-2">
                {formatOptions.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setFormat(id)}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors',
                      format === id
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-sm font-medium">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          /* Signal Selection */
          <div>
            <h3 className="mb-3 text-sm font-medium text-gray-900">Signal Types</h3>
            <div className="flex gap-2">
              {(['sft', 'preference', 'reward'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => toggleSignalType(type)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors capitalize',
                    selectedSignalTypes.has(type)
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  )}
                >
                  <span className="text-sm font-medium">{type}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Exported as JSONL (JSON Lines) format, suitable for fine-tuning.
            </p>
          </div>
        )}

        {/* Preview */}
        <div>
          <h3 className="mb-3 text-sm font-medium text-gray-900">Preview</h3>
          <div className="relative">
            <pre
              className={cn(
                'p-4 rounded-lg bg-gray-900 text-gray-100 text-sm font-mono overflow-auto max-h-64',
                noneSelected && 'flex items-center justify-center text-gray-500'
              )}
            >
              {noneSelected ? (
                <span className="text-gray-500">Select items to preview export</span>
              ) : (
                <code>{exportedContent}</code>
              )}
            </pre>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={handleCopy}
            disabled={noneSelected}
            className="gap-2"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy to Clipboard
              </>
            )}
          </Button>
          <Button
            variant="primary"
            onClick={handleDownload}
            disabled={noneSelected}
            className="gap-2"
          >
            <Download className="w-4 h-4" />
            Download
          </Button>
        </div>
      </div>
    </Modal>
  );
}
