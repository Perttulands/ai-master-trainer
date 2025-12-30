import { getPayload } from '../../db/training-signal-queries';
import type { TrainingExample } from '../../types/training-signal';

export interface ExportedTrainingExample {
  type: 'sft' | 'preference' | 'reward';
  data: any;
  metadata: {
    id: string;
    score?: number;
    createdAt: number;
  };
}

export function formatTrainingExample(example: TrainingExample): ExportedTrainingExample | null {
  try {
    const systemPrompt = example.systemPromptHash ? getPayload<string>(example.systemPromptHash) : undefined;
    const input = example.inputHash ? getPayload<string>(example.inputHash) : undefined;
    
    if (example.exampleType === 'sft') {
      const completion = example.completionHash ? getPayload<string>(example.completionHash) : undefined;
      
      if (!input || !completion) return null;

      // Format as chat messages for SFT
      const messages = [];
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }
      messages.push({ role: 'user', content: input });
      messages.push({ role: 'assistant', content: completion });

      return {
        type: 'sft',
        data: { messages },
        metadata: {
          id: example.id,
          score: example.score,
          createdAt: example.createdAt
        }
      };
    }

    if (example.exampleType === 'preference') {
      const chosen = example.chosenHash ? getPayload<string>(example.chosenHash) : undefined;
      const rejected = example.rejectedHash ? getPayload<string>(example.rejectedHash) : undefined;

      if (!input || !chosen || !rejected) return null;

      return {
        type: 'preference',
        data: {
          prompt: input,
          system: systemPrompt,
          chosen,
          rejected
        },
        metadata: {
          id: example.id,
          score: example.score,
          createdAt: example.createdAt
        }
      };
    }

    if (example.exampleType === 'reward') {
      const completion = example.completionHash ? getPayload<string>(example.completionHash) : undefined;

      if (!input || !completion || example.score === undefined) return null;

      return {
        type: 'reward',
        data: {
          prompt: input,
          completion,
          label: example.score
        },
        metadata: {
          id: example.id,
          score: example.score,
          createdAt: example.createdAt
        }
      };
    }

    return null;
  } catch (err) {
    console.error(`Failed to format example ${example.id}:`, err);
    return null;
  }
}

export function exportTrainingData(examples: TrainingExample[]): string {
  return examples
    .map(formatTrainingExample)
    .filter((ex): ex is ExportedTrainingExample => ex !== null)
    .map(ex => JSON.stringify(ex))
    .join('\n');
}
