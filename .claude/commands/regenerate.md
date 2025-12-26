# /regenerate - Regenerate Unlocked Lineages

Simulate or trigger the core regeneration flow.

## Purpose

This command helps test and debug the main training loop:
1. Get all unlocked lineages for current session
2. Collect their scores and comments
3. Call Master Trainer to evolve each
4. Generate new artifacts
5. Update the UI

## Steps

1. Check current session state
2. Identify unlocked lineages
3. Verify all unlocked lineages have scores
4. Trigger regeneration via Master Trainer agent
5. Log the evolution decisions
6. Display new artifacts

## Debug Mode

Add `--debug` to see:
- Master Trainer reasoning
- Prompt templates used
- LLM API calls and responses
- Timing information
