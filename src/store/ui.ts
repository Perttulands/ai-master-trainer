import { create } from 'zustand';

type PanelType = 'trainer' | 'directives' | null;

interface UIState {
  // Right panel
  activePanel: PanelType;
  selectedLineageId: string | null;

  // Modal
  expandedCardId: string | null;

  // Actions
  setActivePanel: (panel: PanelType) => void;
  setSelectedLineage: (lineageId: string | null) => void;
  expandCard: (lineageId: string) => void;
  closeExpandedCard: () => void;
  openDirectivesForLineage: (lineageId: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activePanel: 'trainer',
  selectedLineageId: null,
  expandedCardId: null,

  setActivePanel: (panel) => {
    set({ activePanel: panel });
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
