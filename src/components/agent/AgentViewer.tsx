import { useState } from 'react';
import { Workflow, FileText, Wrench, Settings, X } from 'lucide-react';
import type { AgentDefinition } from '../../types/agent';
import { FlowchartView } from '../infrastructure/FlowchartView';
import { PromptViewer } from '../infrastructure/PromptViewer';
import { ToolsPanel } from '../infrastructure/ToolsPanel';
import { Badge } from '../ui/Badge';
import { cn } from '../../utils/cn';

type TabId = 'flow' | 'prompt' | 'tools' | 'config';

interface TabConfig {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const tabs: TabConfig[] = [
  { id: 'flow', label: 'Flow', icon: Workflow },
  { id: 'prompt', label: 'Prompt', icon: FileText },
  { id: 'tools', label: 'Tools', icon: Wrench },
  { id: 'config', label: 'Config', icon: Settings },
];

interface AgentViewerProps {
  agent: AgentDefinition;
  className?: string;
  onClose?: () => void;
}

export function AgentViewer({ agent, className, onClose }: AgentViewerProps) {
  const [activeTab, setActiveTab] = useState<TabId>('flow');
  const [isFlowFullscreen, setIsFlowFullscreen] = useState(false);

  const memoryTypeLabels: Record<string, string> = {
    none: 'No Memory',
    buffer: 'Buffer Memory',
    summary: 'Summary Memory',
    vector: 'Vector Memory',
  };

  // Handle fullscreen toggle
  const handleToggleFullscreen = () => {
    setIsFlowFullscreen(!isFlowFullscreen);
  };

  // Fullscreen flow view
  if (isFlowFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-white">
        <div className="absolute top-4 right-4 z-10">
          <button
            onClick={handleToggleFullscreen}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg shadow-lg hover:bg-gray-800 transition-colors"
          >
            <X className="w-4 h-4" />
            Exit Fullscreen
          </button>
        </div>
        <div className="absolute top-4 left-4 z-10">
          <div className="bg-white/90 backdrop-blur rounded-lg shadow-lg border border-gray-200 px-4 py-2">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-gray-900">{agent.name}</h2>
              <Badge variant="primary">v{agent.version}</Badge>
            </div>
          </div>
        </div>
        <FlowchartView
          flow={agent.flow}
          isFullscreen={true}
          onToggleFullscreen={handleToggleFullscreen}
        />
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full bg-white rounded-xl border border-gray-200', className)}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-200">
                <Workflow className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 truncate">
                  {agent.name}
                </h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="primary">v{agent.version}</Badge>
                  <span className="text-xs text-gray-500">{agent.parameters.model}</span>
                </div>
              </div>
            </div>
            {agent.description && (
              <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                {agent.description}
              </p>
            )}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200 bg-gray-50">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors',
                activeTab === tab.id
                  ? 'text-primary-600 border-b-2 border-primary-600 bg-white'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'flow' && (
          <div className="h-full relative">
            <FlowchartView
              flow={agent.flow}
              isFullscreen={false}
              onToggleFullscreen={handleToggleFullscreen}
            />
          </div>
        )}

        {activeTab === 'prompt' && (
          <div className="h-full">
            <PromptViewer prompt={agent.systemPrompt} />
          </div>
        )}

        {activeTab === 'tools' && (
          <div className="h-full">
            <ToolsPanel tools={agent.tools} />
          </div>
        )}

        {activeTab === 'config' && (
          <div className="p-6 space-y-6">
            {/* Memory Configuration */}
            <section>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary-500" />
                Memory Configuration
              </h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Type</span>
                  <Badge variant={agent.memory.type === 'none' ? 'default' : 'primary'}>
                    {memoryTypeLabels[agent.memory.type] || agent.memory.type}
                  </Badge>
                </div>
                {agent.memory.config.maxTokens && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Max Tokens</span>
                    <span className="text-sm font-medium text-gray-900">
                      {agent.memory.config.maxTokens.toLocaleString()}
                    </span>
                  </div>
                )}
                {agent.memory.config.maxMessages && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Max Messages</span>
                    <span className="text-sm font-medium text-gray-900">
                      {agent.memory.config.maxMessages}
                    </span>
                  </div>
                )}
                {agent.memory.config.embeddingModel && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Embedding Model</span>
                    <span className="text-sm font-mono text-gray-900">
                      {agent.memory.config.embeddingModel}
                    </span>
                  </div>
                )}
              </div>
            </section>

            {/* Model Parameters */}
            <section>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                Model Parameters
              </h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Model</span>
                  <span className="text-sm font-mono text-gray-900">
                    {agent.parameters.model}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Temperature</span>
                  <span className="text-sm font-medium text-gray-900">
                    {agent.parameters.temperature}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Max Tokens</span>
                  <span className="text-sm font-medium text-gray-900">
                    {agent.parameters.maxTokens.toLocaleString()}
                  </span>
                </div>
                {agent.parameters.topP !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Top P</span>
                    <span className="text-sm font-medium text-gray-900">
                      {agent.parameters.topP}
                    </span>
                  </div>
                )}
                {agent.parameters.frequencyPenalty !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Frequency Penalty</span>
                    <span className="text-sm font-medium text-gray-900">
                      {agent.parameters.frequencyPenalty}
                    </span>
                  </div>
                )}
                {agent.parameters.presencePenalty !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Presence Penalty</span>
                    <span className="text-sm font-medium text-gray-900">
                      {agent.parameters.presencePenalty}
                    </span>
                  </div>
                )}
              </div>
            </section>

            {/* Metadata */}
            <section>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                Metadata
              </h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Agent ID</span>
                  <span className="text-xs font-mono text-gray-500 truncate max-w-48">
                    {agent.id}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Created</span>
                  <span className="text-sm text-gray-900">
                    {new Date(agent.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Last Updated</span>
                  <span className="text-sm text-gray-900">
                    {new Date(agent.updatedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Tools Count</span>
                  <span className="text-sm font-medium text-gray-900">
                    {agent.tools.length}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Flow Steps</span>
                  <span className="text-sm font-medium text-gray-900">
                    {agent.flow.length}
                  </span>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
