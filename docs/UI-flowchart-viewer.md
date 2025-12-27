# Agent Flowchart Viewer - UI Specification

## Purpose

Visualize an agent's execution flow as an interactive flowchart. Users can explore how the agent works without reading code.

---

## Entry Points

1. **LineageCard**: Click "View Agent" (eye icon)
2. **Export Modal**: Preview before exporting
3. **History**: View historical agent versions

---

## Layout

### Standard View (Modal)
```
┌─────────────────────────────────────────────────────────────────┐
│  Agent: "Email Summarizer" (v3)              [Fullscreen] [X]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│     [FLOWCHART VISUALIZATION]                                   │
│                                                                  │
│     Nodes connected by edges, auto-laid out left-to-right       │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  [Flow] [Prompt] [Tools] [Config]                               │
└─────────────────────────────────────────────────────────────────┘
```

### Fullscreen View
```
┌───────────────────────────────────────────────────────────────────────┐
│  ◀ Back                                                    [Exit FS]  │
├───────────────────────────────────────────────────────────────────────┤
│                                                                        │
│                    [FULL VIEWPORT FLOWCHART]                          │
│                                                                        │
├─────────────────────────────────────────────┬─────────────────────────┤
│  Minimap    Zoom: [+] [-] [Fit]             │  SELECTED NODE DETAILS  │
│  [========]                                  │                         │
│                                              │  Type: prompt           │
│  Controls:                                   │  Label: "Analyze Input" │
│  • Scroll to zoom                            │                         │
│  • Drag to pan                               │  [Config details...]    │
│  • Click node for details                    │                         │
└─────────────────────────────────────────────┴─────────────────────────┘
```

---

## Node Rendering

Nodes are rendered based on their `type` field. The viewer should handle any type gracefully.

### Common Node Types (examples, not exhaustive)
| Type | Suggested Color | Icon |
|------|-----------------|------|
| start | Green | Play |
| prompt | Blue | MessageSquare |
| tool | Purple | Wrench |
| condition | Orange | GitBranch |
| loop | Cyan | Repeat |
| output | Emerald | CheckCircle |

### Fallback
Unknown node types render with a neutral style (gray) and generic icon.

---

## Edge Types

| Type | Style | Color |
|------|-------|-------|
| default | Solid | Gray |
| success/true | Solid | Green |
| failure/false | Dashed | Red |
| error | Dotted | Orange |

---

## Interactions

| Action | Result |
|--------|--------|
| Click node | Open detail panel showing node configuration |
| Hover node | Highlight connected edges |
| Scroll | Zoom in/out |
| Drag | Pan the view |
| Fullscreen button | Expand to full viewport |
| Fit View button | Reset zoom to show all nodes |

---

## Tabs

### Flow Tab
Interactive flowchart visualization.

### Prompt Tab
Full system prompt text with copy button.

### Tools Tab
List of tools with:
- Name and description
- Parameter schema
- Expandable details

### Config Tab
Agent parameters:
- Model settings (temperature, max tokens)
- Memory configuration
- Metadata

---

## Technical Notes

### Layout
Use `dagre` for automatic left-to-right layout:
- Node separation: ~80px horizontal, ~50px vertical
- Edge routing: orthogonal with rounded corners

### Performance
- Virtualize nodes for large graphs (20+ nodes)
- Debounce zoom/pan operations
- Memoize node components

### Accessibility
- Keyboard navigation (Tab through nodes)
- Screen reader support
- Respect `prefers-reduced-motion`
