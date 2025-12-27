import type { LineageLabel } from './index';

/**
 * A custom strategy defined through discussion with the Master Trainer
 */
export interface CustomStrategy {
  label: LineageLabel;
  name: string;           // e.g., "Quick Triage"
  description: string;    // Detailed approach description
  style: string;          // Generation style guidance for the LLM
  temperature: number;    // Model temperature for this strategy (0.0 - 1.0)
}

/**
 * Message in the strategy discussion conversation
 */
export interface StrategyMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  // If this message contains strategy proposals
  proposedStrategies?: CustomStrategy[];
}

/**
 * State of the strategy discussion
 */
export interface StrategyDiscussionState {
  messages: StrategyMessage[];
  currentStrategies: CustomStrategy[];
  isConfirmed: boolean;
  isLoading: boolean;
}

/**
 * Default strategies used as fallback
 */
export const DEFAULT_STRATEGIES: CustomStrategy[] = [
  {
    label: 'A',
    name: 'Concise',
    description: 'Focused on delivering clear, brief responses without unnecessary details.',
    style: 'brief and to-the-point, minimizing words while maximizing clarity',
    temperature: 0.3,
  },
  {
    label: 'B',
    name: 'Detailed',
    description: 'Provides comprehensive, well-structured responses with examples.',
    style: 'thorough and comprehensive, covering all aspects with examples',
    temperature: 0.5,
  },
  {
    label: 'C',
    name: 'Creative',
    description: 'Engages with innovative angles, unique perspectives, and fresh approaches.',
    style: 'creative and engaging, using metaphors, stories, and unexpected angles',
    temperature: 0.9,
  },
  {
    label: 'D',
    name: 'Analytical',
    description: 'Approaches tasks methodically with step-by-step reasoning and data focus.',
    style: 'structured and analytical, breaking down problems with clear logic',
    temperature: 0.4,
  },
];
