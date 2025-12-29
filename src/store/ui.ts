import { create } from 'zustand';

type PanelType = 'trainer' | 'directives' | 'context' | null;

interface UIState {
  // Right panel
  activePanel: PanelType;
  selectedLineageId: string | null;
  isRightPanelCollapsed: boolean;

  // Modal
  expandedCardId: string | null;

  // Actions
  setActivePanel: (panel: PanelType) => void;
  setSelectedLineage: (lineageId: string | null) => void;
  toggleRightPanel: () => void;
  expandCard: (lineageId: string) => void;
  closeExpandedCard: () => void;
  openDirectivesForLineage: (lineageId: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activePanel: 'trainer',
  selectedLineageId: null,
  isRightPanelCollapsed: false,
  expandedCardId: null,

  setActivePanel: (panel) => {
    set({ activePanel: panel });
  },

  toggleRightPanel: () => {
    set((state) => ({ isRightPanelCollapsed: !state.isRightPanelCollapsed }));
  },

  setSelectedLineage: (lineageId) => {
    set({ selectedLineageId: lineageId });
  },

  expandCard: (lineageId) => {
    set({ expandedCardId: lineageId });
  },

  closeExpandedCard: () => {
    set({ expandedCardId: null });
  },

  openDirectivesForLineage: (lineageId) => {
    set({ activePanel: 'directives', selectedLineageId: lineageId });
  },
}));
