/**
 * Evolution Planner Service
 *
 * Creates targeted evolution plans based on credit assignment.
 * Part of the Agent Lightning evolution pipeline.
 */

import type {
  ScoreAnalysis,
  PromptCredit,
  TrajectoryCredit,
  EvolutionPlan,
  EvolutionChange,
  ExpectedImpact,
  HistoryCheck,
  EvolutionRecord,
  LearningInsight,
} from '../types/evolution';
import type { AgentDefinition } from '../types/agent';
import { llmClient, isLLMConfigured } from '../api/llm';

/**
 * Change templates for common issues
 */
const CHANGE_TEMPLATES: Record<string, (aspect: string) => Partial<EvolutionChange>> = {
  length: (aspect) => ({
    component: 'systemPrompt',
    changeType: 'modify',
    target: 'length_instructions',
    reason: `Adjust output length based on ${aspect} feedback`,
  }),
  tone: () => ({
    component: 'systemPrompt',
    changeType: 'modify',
    target: 'tone_instructions',
    reason: 'Adjust communication tone',
  }),
  format: () => ({
    component: 'systemPrompt',
    changeType: 'add',
    target: 'format_instructions',
    reason: 'Add explicit formatting instructions',
  }),
  accuracy: () => ({
    component: 'systemPrompt',
    changeType: 'modify',
    target: 'accuracy_instructions',
    reason: 'Emphasize accuracy and verification',
  }),
  completeness: () => ({
    component: 'systemPrompt',
    changeType: 'add',
    target: 'completeness_instructions',
    reason: 'Add completeness checklist',
  }),
  parameters: () => ({
    component: 'parameters',
    changeType: 'modify',
    target: 'model_parameters',
    reason: 'Adjust model parameters for better output',
  }),
};

/**
 * Generates instruction modifications based on aspect and sentiment
 */
function generateInstructionChange(
  aspect: string,
  sentiment: 'positive' | 'negative' | 'neutral',
  currentPrompt: string
): { before: string | null; after: string | null } {
  const instructions: Record<string, { negative: string; positive: string }> = {
    length: {
      negative: 'Be concise and focused. Avoid unnecessary details or verbosity.',
      positive: 'Maintain your current level of detail and thoroughness.',
    },
    tone: {
      negative: 'Use a professional yet approachable tone. Be helpful and clear.',
      positive: 'Continue with your current communication style.',
    },
    format: {
      negative:
        'Structure your response clearly. Use bullet points or numbered lists when presenting multiple items.',
      positive: 'Maintain your current formatting approach.',
    },
    accuracy: {
      negative:
        'Double-check all facts and claims. If uncertain, acknowledge limitations.',
      positive: 'Continue providing accurate and verified information.',
    },
    completeness: {
      negative:
        'Ensure you address all aspects of the request. Check for missing information before responding.',
      positive: 'Continue providing complete responses.',
    },
    relevance: {
      negative: 'Stay focused on the specific request. Avoid tangential information.',
      positive: 'Continue providing relevant, focused responses.',
    },
    creativity: {
      negative:
        'Explore creative approaches and unique perspectives when appropriate.',
      positive: 'Continue with your current level of creativity.',
    },
  };

  const instruction = instructions[aspect];
  if (!instruction) {
    return { before: null, after: null };
  }

  // Find existing related instruction in prompt
  const patterns: Record<string, RegExp> = {
    length: /(?:be (?:concise|brief|detailed|thorough)|word (?:limit|count)|(?:max|min)imum length)/i,
    tone: /(?:tone|voice|style|manner|professional|casual|friendly)/i,
    format: /(?:format|structure|bullet|list|paragraph|organize)/i,
    accuracy: /(?:accurate|precise|verify|check|fact)/i,
    completeness: /(?:complete|comprehensive|thorough|cover|include)/i,
    relevance: /(?:relevant|focus|specific|scope)/i,
    creativity: /(?:creative|original|innovative|unique)/i,
  };

  const pattern = patterns[aspect];
  const match = pattern ? currentPrompt.match(pattern) : null;

  return {
    before: match ? match[0] : null,
    after: sentiment === 'negative' ? instruction.negative : instruction.positive,
  };
}

/**
 * Plans changes based on prompt-level credit assignment
 */
function planFromPromptCredit(
  agent: AgentDefinition,
  credits: PromptCredit[],
  analysis: ScoreAnalysis
): EvolutionChange[] {
  const changes: EvolutionChange[] = [];

  // Get high-blame segments
  const highBlameCredits = credits.filter(
    (c) => c.blame === 'high' || c.blame === 'medium'
  );

  // Group by related aspect
  const aspectCredits = new Map<string, PromptCredit[]>();
  for (const credit of highBlameCredits) {
    const aspect = credit.relatedAspect || 'general';
    const existing = aspectCredits.get(aspect) || [];
    existing.push(credit);
    aspectCredits.set(aspect, existing);
  }

  // Create changes for each problematic aspect
  for (const [aspect, aspectCreditList] of aspectCredits.entries()) {
    const feedbackAspect = analysis.aspects.find((a) => a.aspect === aspect);
    const sentiment = feedbackAspect?.sentiment || 'negative';

    // Get the template for this aspect
    const template = CHANGE_TEMPLATES[aspect] || CHANGE_TEMPLATES.parameters;
    const baseChange = template(aspect);

    // Generate specific instruction change
    const { before, after } = generateInstructionChange(
      aspect,
      sentiment,
      agent.systemPrompt
    );

    // If we have specific before/after, use them
    if (after) {
      changes.push({
        component: 'systemPrompt',
        changeType: before ? 'modify' : 'add',
        target: baseChange.target || aspect,
        before,
        after,
        reason: baseChange.reason || `Address ${aspect} feedback`,
        confidence: aspectCreditList[0].blame === 'high' ? 0.8 : 0.6,
      });
    }

    // For high-blame segments, also consider removing problematic text
    if (aspectCreditList.some((c) => c.blame === 'high')) {
      const problematicSegment = aspectCreditList.find((c) => c.blame === 'high');
      if (problematicSegment && problematicSegment.segment.length < 200) {
        changes.push({
          component: 'systemPrompt',
          changeType: 'remove',
          target: 'problematic_segment',
          before: problematicSegment.segment,
          after: null,
          reason: `Remove or rephrase: ${problematicSegment.reason}`,
          confidence: 0.5,
        });
      }
    }
  }

  // Add parameter adjustment for low scores
  if (analysis.score <= 4) {
    changes.push({
      component: 'parameters',
      changeType: 'modify',
      target: 'temperature',
      before: String(agent.parameters.temperature),
      after: String(Math.max(0.3, agent.parameters.temperature - 0.2)),
      reason: 'Reduce temperature for more consistent output',
      confidence: 0.7,
    });
  }

  return changes;
}

/**
 * Plans changes based on trajectory credit assignment
 */
function planFromTrajectoryCredit(
  _agent: AgentDefinition,
  credits: TrajectoryCredit[],
  _analysis: ScoreAnalysis
): EvolutionChange[] {
  const changes: EvolutionChange[] = [];

  // Find problematic spans
  const problematicSpans = credits.filter((c) => c.contribution < -0.2);

  // Group by reason type
  const toolErrors = problematicSpans.filter((s) =>
    s.reason.toLowerCase().includes('tool')
  );
  const llmIssues = problematicSpans.filter((s) =>
    s.reason.toLowerCase().includes('llm')
  );
  const outputIssues = problematicSpans.filter((s) =>
    s.reason.toLowerCase().includes('output')
  );

  // Address tool issues
  if (toolErrors.length > 0) {
    changes.push({
      component: 'tools',
      changeType: 'modify',
      target: 'tool_error_handling',
      before: null,
      after: 'Add graceful error handling to tools',
      reason: `${toolErrors.length} tool call(s) had errors`,
      confidence: 0.7,
    });
  }

  // Address LLM/reasoning issues
  if (llmIssues.length > 0) {
    changes.push({
      component: 'systemPrompt',
      changeType: 'add',
      target: 'reasoning_guidance',
      before: null,
      after:
        'Think step by step. Validate your reasoning before providing the final answer.',
      reason: `${llmIssues.length} LLM call(s) produced suboptimal results`,
      confidence: 0.6,
    });
  }

  // Address output issues
  if (outputIssues.length > 0) {
    changes.push({
      component: 'flow',
      changeType: 'add',
      target: 'output_validation',
      before: null,
      after: 'Add output validation step before final response',
      reason: `${outputIssues.length} output issue(s) detected`,
      confidence: 0.5,
    });
  }

  return changes;
}

/**
 * Uses LLM to generate an evolution plan
 */
async function planWithLLM(
  agent: AgentDefinition,
  analysis: ScoreAnalysis,
  credits: PromptCredit[] | TrajectoryCredit[],
  existingChanges: EvolutionChange[]
): Promise<EvolutionPlan | null> {
  const isPromptCredit = credits.length > 0 && 'segment' in credits[0];

  const creditSummary = isPromptCredit
    ? (credits as PromptCredit[])
        .filter((c) => c.blame === 'high' || c.blame === 'medium')
        .map(
          (c) =>
            `- [${c.blame}] Segment ${c.segmentIndex}: ${c.relatedAspect || 'general'} - ${c.reason}`
        )
        .join('\n')
    : (credits as TrajectoryCredit[])
        .filter((c) => c.contribution < 0)
        .map((c) => `- [${c.contribution.toFixed(2)}] ${c.reason}`)
        .join('\n');

  const existingChangesSummary =
    existingChanges.length > 0
      ? existingChanges
          .map((c) => `- ${c.changeType} ${c.component}/${c.target}: ${c.reason}`)
          .join('\n')
      : 'None proposed yet';

  const systemPrompt = `You are an AI agent evolution planner. Based on user feedback and credit assignment analysis, create a targeted evolution plan.

Guidelines:
1. Focus on the highest-impact changes
2. Avoid over-engineering - make minimal necessary changes
3. Each change should address a specific issue
4. Provide a testable hypothesis

Return a JSON object:
{
  "changes": [
    {
      "component": "systemPrompt|tools|flow|parameters",
      "changeType": "add|remove|modify",
      "target": "what_to_change",
      "before": "current value or null",
      "after": "new value or null",
      "reason": "why this change",
      "confidence": 0.0-1.0
    }
  ],
  "hypothesis": "After these changes, we expect...",
  "expectedImpact": [
    {"aspect": "aspect_name", "direction": "improve|maintain"}
  ]
}`;

  const userPrompt = `Agent: ${agent.name}
Current System Prompt (first 500 chars):
${agent.systemPrompt.substring(0, 500)}${agent.systemPrompt.length > 500 ? '...' : ''}

Score: ${analysis.score}/10
Comment: ${analysis.comment || '(none)'}
Aspects: ${analysis.aspects.map((a) => `${a.aspect}(${a.sentiment})`).join(', ') || 'none'}
Trend: ${analysis.trend} (delta: ${analysis.deltaFromPrevious})

Credit Assignment:
${creditSummary || 'No high-blame segments identified'}

Already Proposed Changes:
${existingChangesSummary}

Create an evolution plan. Return ONLY the JSON object.`;

  try {
    const response = await llmClient.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { maxTokens: 1024, temperature: 0.5 }
    );

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON object in response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as EvolutionPlan;

    // Validate and sanitize
    return {
      changes: (parsed.changes || []).map((c) => ({
        ...c,
        confidence: Math.max(0, Math.min(1, c.confidence || 0.5)),
      })),
      hypothesis: parsed.hypothesis || 'Changes should improve agent performance',
      expectedImpact: parsed.expectedImpact || [],
    };
  } catch (error) {
    console.warn('LLM evolution planning failed:', error);
    return null;
  }
}

/**
 * Checks proposed changes against history
 */
export async function checkAgainstHistory(
  change: EvolutionChange,
  pastRecords: EvolutionRecord[],
  insights: LearningInsight[]
): Promise<HistoryCheck> {
  const similarChanges: HistoryCheck['similarPastChanges'] = [];

  // Find similar past changes
  for (const record of pastRecords) {
    for (const pastChange of record.changes) {
      // Check if same component and similar target
      if (
        pastChange.component === change.component &&
        (pastChange.target === change.target ||
          pastChange.changeType === change.changeType)
      ) {
        const outcome = record.outcome;
        similarChanges.push({
          change: pastChange,
          outcome: outcome
            ? outcome.scoreDelta > 0
              ? 'improved'
              : outcome.scoreDelta < 0
                ? 'worsened'
                : 'neutral'
            : 'neutral',
          scoreDelta: outcome?.scoreDelta || 0,
        });
      }
    }
  }

  // Check insights for patterns
  const relevantInsights = insights.filter(
    (i) =>
      i.patternType ===
      (`${change.component}_change` as LearningInsight['patternType']) ||
      i.pattern.toLowerCase().includes(change.target.toLowerCase())
  );

  // Determine recommendation
  let recommendation: HistoryCheck['recommendation'] = 'apply';
  let reason = 'No conflicting history found';

  if (similarChanges.length > 0) {
    const worsenedCount = similarChanges.filter(
      (c) => c.outcome === 'worsened'
    ).length;
    const improvedCount = similarChanges.filter(
      (c) => c.outcome === 'improved'
    ).length;

    if (worsenedCount > improvedCount && worsenedCount >= 2) {
      recommendation = 'skip';
      reason = `Similar changes worsened scores ${worsenedCount} times in the past`;
    } else if (worsenedCount > 0 && improvedCount === 0) {
      recommendation = 'modify';
      reason = 'Similar change previously worsened score - consider alternative approach';
    } else if (improvedCount > worsenedCount) {
      recommendation = 'apply';
      reason = `Similar changes improved scores ${improvedCount} times`;
    }
  }

  // Check insights
  for (const insight of relevantInsights) {
    if (insight.failureCount > insight.successCount * 2) {
      recommendation = 'skip';
      reason = `Learning insight suggests this pattern often fails: "${insight.pattern}"`;
    } else if (insight.successCount > insight.failureCount * 2) {
      recommendation = 'apply';
      reason = `Learning insight supports this pattern: "${insight.pattern}"`;
    }
  }

  return {
    proposedChange: change,
    similarPastChanges: similarChanges,
    recommendation,
    reason,
  };
}

/**
 * Main evolution planning function
 */
export async function createEvolutionPlan(
  agent: AgentDefinition,
  analysis: ScoreAnalysis,
  credits: PromptCredit[] | TrajectoryCredit[],
  pastRecords: EvolutionRecord[] = [],
  insights: LearningInsight[] = []
): Promise<EvolutionPlan> {
  // Determine credit mode
  const isPromptCredit = credits.length === 0 || 'segment' in credits[0];

  // Generate base changes from credit assignment
  let baseChanges: EvolutionChange[];
  if (isPromptCredit) {
    baseChanges = planFromPromptCredit(
      agent,
      credits as PromptCredit[],
      analysis
    );
  } else {
    baseChanges = planFromTrajectoryCredit(
      agent,
      credits as TrajectoryCredit[],
      analysis
    );
  }

  // Try LLM-enhanced planning
  let plan: EvolutionPlan | null = null;
  if (isLLMConfigured()) {
    plan = await planWithLLM(agent, analysis, credits, baseChanges);
  }

  // Use base changes if LLM planning failed
  if (!plan) {
    plan = {
      changes: baseChanges,
      hypothesis: generateHypothesis(baseChanges, analysis),
      expectedImpact: generateExpectedImpact(analysis.aspects),
    };
  }

  // Check each change against history and filter
  const checkedChanges: EvolutionChange[] = [];
  for (const change of plan.changes) {
    const check = await checkAgainstHistory(change, pastRecords, insights);

    if (check.recommendation === 'apply') {
      checkedChanges.push(change);
    } else if (check.recommendation === 'modify') {
      // Reduce confidence for changes that need modification
      checkedChanges.push({
        ...change,
        confidence: change.confidence * 0.7,
        reason: `${change.reason} (Note: ${check.reason})`,
      });
    }
    // Skip changes that history suggests will fail
  }

  return {
    ...plan,
    changes: checkedChanges,
  };
}

/**
 * Generates a hypothesis from changes
 */
function generateHypothesis(
  changes: EvolutionChange[],
  analysis: ScoreAnalysis
): string {
  if (changes.length === 0) {
    return 'No significant changes needed - maintain current approach';
  }

  const components = [...new Set(changes.map((c) => c.component))];
  const improvements = analysis.aspects
    .filter((a) => a.sentiment === 'negative')
    .map((a) => a.aspect);

  if (improvements.length > 0) {
    return `After modifying ${components.join(' and ')}, ${improvements.join(' and ')} should improve, leading to a higher score`;
  }

  return `After modifying ${components.join(' and ')}, overall performance should improve`;
}

/**
 * Generates expected impact from aspects
 */
function generateExpectedImpact(aspects: ScoreAnalysis['aspects']): ExpectedImpact[] {
  return aspects.map((a) => ({
    aspect: a.aspect,
    direction: a.sentiment === 'negative' ? 'improve' : 'maintain',
  }));
}

/**
 * Summarizes an evolution plan for logging
 */
export function summarizePlan(plan: EvolutionPlan): string {
  if (plan.changes.length === 0) {
    return 'No changes planned';
  }

  const changeSummary = plan.changes
    .map((c) => `${c.changeType} ${c.component}/${c.target}`)
    .join(', ');

  return `Plan: ${changeSummary}. Hypothesis: ${plan.hypothesis}`;
}
