import dagre from 'dagre';
import type { Node, Edge } from 'reactflow';
import { MarkerType } from 'reactflow';
import type { AgentFlowStep } from '../types/agent';

export interface LayoutOptions {
  direction?: 'LR' | 'TB' | 'RL' | 'BT';
  nodeWidth?: number;
  nodeHeight?: number;
  nodeSeparation?: number;
  rankSeparation?: number;
}

const DEFAULT_OPTIONS: LayoutOptions = {
  direction: 'LR',
  nodeWidth: 180,
  nodeHeight: 60,
  nodeSeparation: 80,
  rankSeparation: 120,
};

/**
 * Auto-layout nodes using dagre algorithm
 */
export function layoutFlow(
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): Node[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: opts.direction,
    nodesep: opts.nodeSeparation,
    ranksep: opts.rankSeparation,
    marginx: 50,
    marginy: 50,
  });

  // Add nodes to dagre
  nodes.forEach((node) => {
    const width = node.data?.step?.type === 'condition'
      ? 100 // Diamond nodes are smaller
      : opts.nodeWidth!;
    const height = node.data?.step?.type === 'condition'
      ? 100
      : opts.nodeHeight!;

    dagreGraph.setNode(node.id, { width, height });
  });

  // Add edges to dagre
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  // Run the layout
  dagre.layout(dagreGraph);

  // Apply positions to nodes
  return nodes.map((node) => {
    const dagreNode = dagreGraph.node(node.id);

    return {
      ...node,
      position: {
        x: dagreNode.x - dagreNode.width / 2,
        y: dagreNode.y - dagreNode.height / 2,
      },
    };
  });
}

/**
 * Convert AgentFlowStep array to React Flow nodes and edges with auto-layout
 */
export function convertFlowToLayoutedElements(
  flow: AgentFlowStep[],
  options: LayoutOptions = {}
): { nodes: Node[]; edges: Edge[] } {
  // Handle empty flow
  if (!flow || flow.length === 0) {
    return { nodes: [], edges: [] };
  }

  // Build set of valid step IDs for connection validation
  const validStepIds = new Set(flow.map((step) => step.id));

  // First create basic nodes without layout positions
  const nodes: Node[] = flow.map((step) => ({
    id: step.id,
    type: 'flowNode',
    position: { x: 0, y: 0 }, // Will be set by layout
    data: { step },
  }));

  // Create edges (only for valid connections)
  const edges: Edge[] = [];

  flow.forEach((step) => {
    const { connections } = step;

    // Standard next connection - validate target exists
    if (connections.next && validStepIds.has(connections.next)) {
      edges.push({
        id: `${step.id}-${connections.next}`,
        source: step.id,
        target: connections.next,
        type: 'smoothstep',
        animated: false,
        style: { strokeWidth: 2, stroke: '#64748b' },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: '#64748b',
        },
      });
    } else if (connections.next && !validStepIds.has(connections.next)) {
      console.warn(`[FlowLayout] Invalid connection: ${step.id} -> ${connections.next} (target not found)`);
    }

    // Condition true branch - validate target exists
    if (connections.onTrue && validStepIds.has(connections.onTrue)) {
      edges.push({
        id: `${step.id}-true-${connections.onTrue}`,
        source: step.id,
        sourceHandle: 'true',
        target: connections.onTrue,
        type: 'smoothstep',
        animated: false,
        label: 'Yes',
        labelStyle: { fill: '#16a34a', fontWeight: 600, fontSize: 11 },
        labelBgStyle: { fill: '#dcfce7', fillOpacity: 0.8 },
        labelBgPadding: [4, 4] as [number, number],
        labelBgBorderRadius: 4,
        style: { strokeWidth: 2, stroke: '#16a34a' },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: '#16a34a',
        },
      });
    } else if (connections.onTrue && !validStepIds.has(connections.onTrue)) {
      console.warn(`[FlowLayout] Invalid onTrue connection: ${step.id} -> ${connections.onTrue} (target not found)`);
    }

    // Condition false branch - validate target exists
    if (connections.onFalse && validStepIds.has(connections.onFalse)) {
      edges.push({
        id: `${step.id}-false-${connections.onFalse}`,
        source: step.id,
        sourceHandle: 'false',
        target: connections.onFalse,
        type: 'smoothstep',
        animated: false,
        label: 'No',
        labelStyle: { fill: '#dc2626', fontWeight: 600, fontSize: 11 },
        labelBgStyle: { fill: '#fee2e2', fillOpacity: 0.8 },
        labelBgPadding: [4, 4] as [number, number],
        labelBgBorderRadius: 4,
        style: { strokeWidth: 2, stroke: '#dc2626', strokeDasharray: '6 3' },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: '#dc2626',
        },
      });
    } else if (connections.onFalse && !validStepIds.has(connections.onFalse)) {
      console.warn(`[FlowLayout] Invalid onFalse connection: ${step.id} -> ${connections.onFalse} (target not found)`);
    }

    // Error branch - validate target exists
    if (connections.onError && validStepIds.has(connections.onError)) {
      edges.push({
        id: `${step.id}-error-${connections.onError}`,
        source: step.id,
        sourceHandle: 'error',
        target: connections.onError,
        type: 'smoothstep',
        animated: false,
        label: 'Error',
        labelStyle: { fill: '#f97316', fontWeight: 600, fontSize: 10 },
        labelBgStyle: { fill: '#ffedd5', fillOpacity: 0.8 },
        labelBgPadding: [3, 3] as [number, number],
        labelBgBorderRadius: 4,
        style: { strokeWidth: 2, stroke: '#f97316', strokeDasharray: '3 3' },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: '#f97316',
        },
      });
    } else if (connections.onError && !validStepIds.has(connections.onError)) {
      console.warn(`[FlowLayout] Invalid onError connection: ${step.id} -> ${connections.onError} (target not found)`);
    }
  });

  // Apply auto-layout
  const layoutedNodes = layoutFlow(nodes, edges, options);

  return { nodes: layoutedNodes, edges };
}

/**
 * Returns an empty flow for direct LLM execution mode.
 * Agents with empty flows bypass flow execution and use executeSinglePromptDirect().
 * This is the recommended approach for basic agents.
 */
export function getDirectExecutionFlow(): AgentFlowStep[] {
  return [];
}

/**
 * Get default flow for demonstration
 * @deprecated Use getDirectExecutionFlow() instead. This demo flow has hardcoded
 * templates that ignore user input. Kept for backwards compatibility only.
 */
export function getDefaultDemoFlow(): AgentFlowStep[] {
  return [
    {
      id: 'start-1',
      type: 'start',
      name: 'Start',
      config: {},
      position: { x: 0, y: 0 },
      connections: { next: 'prompt-1' },
    },
    {
      id: 'prompt-1',
      type: 'prompt',
      name: 'Process Input',
      config: {
        template: 'Analyze the user input and determine the best approach.',
      },
      position: { x: 0, y: 0 },
      connections: { next: 'condition-1' },
    },
    {
      id: 'condition-1',
      type: 'condition',
      name: 'Needs Tool?',
      config: {
        condition: 'response.requiresTool === true',
      },
      position: { x: 0, y: 0 },
      connections: { onTrue: 'tool-1', onFalse: 'output-1' },
    },
    {
      id: 'tool-1',
      type: 'tool',
      name: 'Execute Tool',
      config: {
        toolName: 'web_search',
        parameters: { query: '{{input}}' },
      },
      position: { x: 0, y: 0 },
      connections: { next: 'loop-1', onError: 'output-1' },
    },
    {
      id: 'loop-1',
      type: 'loop',
      name: 'Refine Results',
      config: {
        maxIterations: 3,
        condition: 'results.quality < 0.8',
      },
      position: { x: 0, y: 0 },
      connections: { next: 'output-1' },
    },
    {
      id: 'output-1',
      type: 'output',
      name: 'Generate Response',
      config: {
        format: 'markdown',
      },
      position: { x: 0, y: 0 },
      connections: {},
    },
  ];
}
