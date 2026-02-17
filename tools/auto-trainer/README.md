# Auto-Trainer

Rubric-based auto-training tool for [ludus-magnus](https://github.com/Perttulands/ludus-magnus). Automatically evolves AI agents by running them against test inputs and scoring outputs with an LLM judge.

## How it works

1. **Define a rubric** — weighted evaluation criteria for your agent
2. **Define test inputs** — diverse scenarios to stress-test the agent
3. **Run the trainer** — it loops: run agent → judge output → iterate → repeat
4. **Watch on the viewer** — real-time dashboard showing scores, prompts, and outputs

```
┌─────────┐     ┌───────────┐     ┌─────────┐     ┌──────────┐
│  Rubric  │────>│  Run agent │────>│  Judge   │────>│ Iterate  │──┐
│  + Test  │     │  on each   │     │  against │     │ (evolve) │  │
│  Inputs  │     │  input     │     │  rubric  │     │          │  │
└─────────┘     └───────────┘     └─────────┘     └──────────┘  │
                      ^                                           │
                      └───────────── next generation ─────────────┘
```

## Prerequisites

- [ludus-magnus](https://github.com/Perttulands/ludus-magnus) binary (Go CLI)
- An OpenAI-compatible LLM endpoint (LiteLLM, OpenAI, OpenRouter, etc.)
- Python 3.10+

## Quick start

```bash
# Set environment
export LITELLM_BASE="https://your-litellm-proxy.com/v1"
export LITELLM_KEY="sk-your-key"
export LITELLM_MODEL="your-model-name"
export LUDUS_BIN="/path/to/ludus-magnus"

# Create your rubric and test inputs (see examples/)
cp examples/rubric.json my-rubric.json
cp examples/test_inputs.json my-inputs.json
# Edit both files for your use case

# Start the viewer (in a separate terminal)
python viewer.py

# Run the trainer
python trainer.py my-rubric.json my-inputs.json
```

## Rubric format

```json
{
  "name": "My Agent",
  "need": "System prompt seed / agent description for ludus-magnus init",
  "passing_score": 7.5,
  "max_generations": 5,
  "criteria": [
    {
      "id": "unique_id",
      "name": "Human-readable name",
      "description": "What the judge should evaluate",
      "weight": 2.0
    }
  ]
}
```

- **need**: Used as the `--need` flag when initializing a new ludus-magnus session
- **passing_score**: Stop training when average weighted score reaches this threshold
- **max_generations**: Hard stop after this many iterations
- **weight**: Higher weight = more influence on the aggregate score

## Test inputs format

```json
{
  "name": "My test suite",
  "inputs": [
    {
      "id": "unique_id",
      "name": "Description of the test case",
      "input": "The actual text sent to the agent"
    }
  ]
}
```

Include a mix of: happy path, vague/minimal, expert/detailed, edge cases, adversarial.

## Viewer

The viewer serves a web dashboard that auto-refreshes every 3 seconds:

```bash
# Default: reads .ludus-magnus/state.json on port 8777
python viewer.py

# Custom state path and port
python viewer.py /path/to/state.json 9000
```

Features:
- Summary stats (sessions, versions, artifacts, avg score)
- Agent version history with collapsible system prompts
- Rubric score breakdown with visual bars
- All test run inputs/outputs with scores
- Active directives display

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LITELLM_BASE` | Yes | — | LLM API base URL |
| `LITELLM_KEY` | Yes | — | LLM API key |
| `LITELLM_MODEL` | No | `gpt-4o-mini` | Model for agent generation and execution |
| `JUDGE_MODEL` | No | same as `LITELLM_MODEL` | Model for rubric evaluation |
| `LUDUS_BIN` | No | `ludus-magnus` | Path to ludus-magnus binary |
| `PROVIDER` | No | `openai-compatible` | LLM provider type |

## Resuming a session

Pass an existing session ID as the third argument to continue training:

```bash
python trainer.py my-rubric.json my-inputs.json ses_abc12345
```

## How scoring works

Each test input is scored independently by the LLM judge against all rubric criteria (1-10). Scores are weighted and averaged:

```
weighted_avg = sum(criterion_score * criterion_weight) / sum(weights)
generation_avg = mean(weighted_avg across all test inputs)
```

If `generation_avg >= passing_score`, training stops. Otherwise, criterion-level feedback is injected as a directive and the agent evolves.
