import type { Lineage, LineageLabel, TrainerMessage } from '../types';
import { generateId } from '../utils/id';

const STRATEGY_TAGS = [
  'Concise',
  'Detailed',
  'Creative',
  'Analytical',
  'Conversational',
  'Formal',
  'Storytelling',
  'Data-driven',
];

const INITIAL_STRATEGIES: Record<LineageLabel, { tag: string; style: string }> = {
  A: { tag: 'Concise', style: 'brief and to-the-point' },
  B: { tag: 'Detailed', style: 'comprehensive and thorough' },
  C: { tag: 'Creative', style: 'innovative and engaging' },
  D: { tag: 'Analytical', style: 'structured and data-focused' },
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(): Promise<void> {
  return delay(500 + Math.random() * 1000);
}

export interface InitialLineageConfig {
  label: LineageLabel;
  strategyTag: string;
  content: string;
}

export async function generateInitialLineages(
  need: string,
  constraints?: string
): Promise<InitialLineageConfig[]> {
  await randomDelay();

  const labels: LineageLabel[] = ['A', 'B', 'C', 'D'];

  return labels.map((label) => {
    const strategy = INITIAL_STRATEGIES[label];
    const content = generateArtifactContent(need, strategy.style, constraints);
    return {
      label,
      strategyTag: strategy.tag,
      content,
    };
  });
}

export async function evolveLineage(
  lineage: Lineage,
  need: string,
  previousScore: number,
  _previousContent: string,
  cycle: number
): Promise<string> {
  await randomDelay();

  // Simulate evolution based on score
  let evolutionNote = '';
  if (previousScore >= 8) {
    evolutionNote = 'Building on the successful approach from the previous cycle';
  } else if (previousScore >= 5) {
    evolutionNote = 'Incorporating feedback to improve upon the previous attempt';
  } else {
    evolutionNote = 'Taking a significantly different approach based on low score feedback';
  }

  const directiveNote = lineage.directiveSticky
    ? `\nApplying sticky directive: "${lineage.directiveSticky}"`
    : '';
  const oneshotNote = lineage.directiveOneshot
    ? `\nApplying one-shot directive: "${lineage.directiveOneshot}"`
    : '';

  const strategy = INITIAL_STRATEGIES[lineage.label];

  return `[Cycle ${cycle} - Lineage ${lineage.label}]

${evolutionNote}${directiveNote}${oneshotNote}

---

${generateArtifactContent(need, strategy.style, undefined, cycle)}

---

Strategy: ${lineage.strategyTag || strategy.tag}
Previous Score: ${previousScore}/10
Evolution Applied: Yes`;
}

function generateArtifactContent(
  need: string,
  style: string,
  constraints?: string,
  cycle: number = 1
): string {
  const constraintNote = constraints ? `\n\nConstraints applied: ${constraints}` : '';

  // Generate mock content based on the need
  const samples = [
    `Here is a ${style} response to your need: "${need}"

This artifact demonstrates the ${style} approach by presenting information in a clear and focused manner. The content has been tailored to match the requested style while addressing the core requirements.

Key points:
1. Primary consideration addressed
2. Supporting elements included
3. Relevant context provided

${cycle > 1 ? `This is iteration ${cycle}, refined based on your feedback.` : 'This is the initial generation.'}${constraintNote}`,

    `# Response: ${need}

Taking a ${style} approach, here's what we've created:

## Overview
A carefully crafted response that embodies the ${style} methodology. Each element has been considered to maximize value and clarity.

## Details
The response incorporates best practices while remaining aligned with the stated objectives. Special attention has been paid to the ${style} characteristics.

${cycle > 1 ? `Iteration ${cycle} - Enhanced based on previous evaluations.` : 'First draft - awaiting your evaluation.'}${constraintNote}`,

    `**${style.charAt(0).toUpperCase() + style.slice(1)} Response**

Addressing: ${need}

This ${style} artifact provides a targeted response to your requirements. The approach emphasizes ${style} characteristics while maintaining practical applicability.

Core Elements:
- Foundation: Solid base aligned with requirements
- Execution: ${style} methodology applied throughout
- Refinement: ${cycle > 1 ? `Version ${cycle} with improvements` : 'Initial version ready for review'}

${constraintNote}`,
  ];

  return samples[Math.floor(Math.random() * samples.length)];
}

export async function respondToChat(
  _userMessage: string,
  sessionContext: { need: string; lineagesCount: number; currentCycle: number }
): Promise<TrainerMessage> {
  await randomDelay();

  const responses = [
    `I understand you're working on: "${sessionContext.need}". Based on the current state with ${sessionContext.lineagesCount} lineages at cycle ${sessionContext.currentCycle}, I recommend focusing on the highest-scoring options and providing specific feedback on what's working well.`,

    `Great question! For your training session, consider locking any lineages that score 8 or above - they represent strong candidates. For lower-scoring ones, try adding directives to guide their evolution in a specific direction.`,

    `Looking at your session, here's my suggestion: Evaluate each artifact carefully, score them honestly, and don't hesitate to lock early winners. The unlocked lineages will continue to evolve and may surprise you with creative alternatives.`,

    `The key to effective training is clear feedback. High scores tell me to continue in that direction, while low scores signal the need for significant changes. Comments are especially valuable for nuanced guidance.`,

    `Remember, you can use sticky directives for persistent guidance (like "keep it under 200 words") and one-shot directives for single-iteration experiments (like "try a completely different angle").`,
  ];

  const content = responses[Math.floor(Math.random() * responses.length)];

  return {
    id: generateId(),
    role: 'assistant',
    content,
    timestamp: Date.now(),
  };
}

export function getRandomStrategyTag(): string {
  return STRATEGY_TAGS[Math.floor(Math.random() * STRATEGY_TAGS.length)];
}
