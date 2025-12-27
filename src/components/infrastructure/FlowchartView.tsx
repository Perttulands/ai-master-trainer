import { useMemo, useCallback, useState, useEffect } from 'react';
import ReactFlow, {
  Background,
  MiniMap,
  Node,
  NodeTypes,
  ConnectionLineType,
  useReactFlow,
  ReactFlowProvider,
  Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Move,
  Crosshair,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { FlowNode } from './FlowNode';
import { NodeDetailPanel } from './NodeDetailPanel';
import { convertFlowToLayoutedElements, getDefaultDemoFlow } from '../../utils/flowLayout';
import type { AgentFlowStep } from '../../types/agent';

interface FlowchartViewProps {
  flow: AgentFlowStep[];
  className?: string;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

const nodeTypes: NodeTypes = {
  flowNode: FlowNode,
};

// MiniMap color function
function nodeColor(node: Node): string {
  const type = node.data?.step?.type;
  const colors: Record<string, string> = {
    start: '#10b981',
    prompt: '#3b82f6',
    tool: '#8b5cf6',
    condition: '#f59e0b',
    loop: '#06b6d4',
    output: '#22c55e',
  };
  return colors[type] || '#6b7280';
}

function FlowchartViewInner({
  flow,
  className,
  isFullscreen,
  onToggleFullscreen,
}: FlowchartViewProps) {
  const reactFlow = useReactFlow();
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  // Use demo flow if no flow provided
  const actualFlow = flow.length > 0 ? flow : getDefaultDemoFlow();

  // Convert flow to nodes and edges with layout
  const { nodes: initialNodes, edges } = useMemo(
    () => convertFlowToLayoutedElements(actualFlow),
    [actualFlow]
  );

  // Add selection state and callbacks to nodes
  const nodes = useMemo(() => {
    return initialNodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        isSelected: node.id === selectedStepId,
        onSelect: (stepId: string) => setSelectedStepId(stepId),
      },
    }));
  }, [initialNodes, selectedStepId]);

  // Get selected step
  const selectedStep = useMemo(() => {
    return actualFlow.find((step) => step.id === selectedStepId) || null;
  }, [actualFlow, selectedStepId]);

  // Handle clicking on the background to deselect
  const handlePaneClick = useCallback(() => {
    setSelectedStepId(null);
  }, []);

  // Fit view on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      reactFlow.fitView({ padding: 0.2, duration: 500 });
    }, 100);
    return () => clearTimeout(timer);
  }, [reactFlow, nodes]);

  // Custom controls
  const handleZoomIn = () => reactFlow.zoomIn({ duration: 200 });
  const handleZoomOut = () => reactFlow.zoomOut({ duration: 200 });
  const handleFitView = () => reactFlow.fitView({ padding: 0.2, duration: 300 });
  const handleCenter = () => {
    const avgX = nodes.reduce((sum, n) => sum + n.position.x, 0) / nodes.length;
    const avgY = nodes.reduce((sum, n) => sum + n.position.y, 0) / nodes.length;
    reactFlow.setCenter(avgX + 80, avgY + 30, { duration: 300, zoom: 1 });
  };

  return (
    <div className={cn(
      'relative flex bg-gradient-to-br from-gray-50 to-slate-100',
      isFullscreen ? 'fixed inset-0 z-50' : 'w-full h-full min-h-96',
      className
    )}>
      {/* Main flowchart area */}
      <div className={cn(
        'flex-1 rounded-xl overflow-hidden',
        !isFullscreen && 'border border-gray-200'
      )}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          connectionLineType={ConnectionLineType.SmoothStep}
          onPaneClick={handlePaneClick}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
          panOnDrag
          zoomOnScroll
          zoomOnPinch
          minZoom={0.2}
          maxZoom={2}
        >
          {/* Custom gradient background */}
          <Background
            color="#cbd5e1"
            gap={20}
            size={1}
            style={{ opacity: 0.5 }}
          />

          {/* MiniMap - only in fullscreen */}
          {isFullscreen && (
            <MiniMap
              nodeColor={nodeColor}
              nodeStrokeWidth={3}
              zoomable
              pannable
              className="!bg-white !rounded-lg !shadow-lg !border !border-gray-200"
              style={{
                width: 160,
                height: 100,
              }}
            />
          )}

          {/* Custom Control Panel */}
          <Panel position="top-left" className="!m-3">
            <div className="flex items-center gap-1.5 bg-white rounded-lg shadow-lg border border-gray-200 p-1">
              <button
                onClick={handleZoomIn}
                className="p-2 rounded-md hover:bg-gray-100 text-gray-600 transition-colors"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={handleZoomOut}
                className="p-2 rounded-md hover:bg-gray-100 text-gray-600 transition-colors"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <div className="w-px h-6 bg-gray-200" />
              <button
                onClick={handleFitView}
                className="p-2 rounded-md hover:bg-gray-100 text-gray-600 transition-colors"
                title="Fit View"
              >
                <Move className="w-4 h-4" />
              </button>
              <button
                onClick={handleCenter}
                className="p-2 rounded-md hover:bg-gray-100 text-gray-600 transition-colors"
                title="Center"
              >
                <Crosshair className="w-4 h-4" />
              </button>
              {onToggleFullscreen && (
                <>
                  <div className="w-px h-6 bg-gray-200" />
                  <button
                    onClick={onToggleFullscreen}
                    className="p-2 rounded-md hover:bg-gray-100 text-gray-600 transition-colors"
                    title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                  >
                    {isFullscreen ? (
                      <Minimize2 className="w-4 h-4" />
                    ) : (
                      <Maximize2 className="w-4 h-4" />
                    )}
                  </button>
                </>
              )}
            </div>
          </Panel>

          {/* Stats Panel */}
          <Panel position="bottom-left" className="!m-3">
            <div className="flex items-center gap-3 bg-white/90 backdrop-blur rounded-lg shadow-sm border border-gray-200 px-3 py-2 text-xs text-gray-600">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {actualFlow.length} nodes
              </span>
              <span className="text-gray-300">|</span>
              <span>Scroll to zoom, drag to pan</span>
            </div>
          </Panel>

          {/* Title Panel - in fullscreen */}
          {isFullscreen && (
            <Panel position="top-center" className="!m-3">
              <div className="bg-white/90 backdrop-blur rounded-lg shadow-sm border border-gray-200 px-4 py-2">
                <h2 className="text-sm font-semibold text-gray-900">
                  Agent Flowchart
                </h2>
              </div>
            </Panel>
          )}

          {/* Legend Panel */}
          <Panel position="bottom-right" className="!m-3 !mb-16">
            <div className="bg-white/90 backdrop-blur rounded-lg shadow-sm border border-gray-200 p-3">
              <h4 className="text-xs font-semibold text-gray-500 mb-2">Legend</h4>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-emerald-500" />
                  <span className="text-gray-600">Start/Output</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-blue-500" />
                  <span className="text-gray-600">Prompt</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-violet-500" />
                  <span className="text-gray-600">Tool</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded rotate-45 bg-amber-500" style={{ width: 10, height: 10 }} />
                  <span className="text-gray-600">Condition</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-cyan-500" />
                  <span className="text-gray-600">Loop</span>
                </div>
              </div>
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {/* Detail Panel - slides in when node is selected */}
      {selectedStep && (
        <NodeDetailPanel
          step={selectedStep}
          onClose={() => setSelectedStepId(null)}
        />
      )}
    </div>
  );
}

export function FlowchartView(props: FlowchartViewProps) {
  return (
    <ReactFlowProvider>
      <FlowchartViewInner {...props} />
    </ReactFlowProvider>
  );
}

FlowchartView.displayName = 'FlowchartView';
