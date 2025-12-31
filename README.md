# Training Camp

**Train AI agents without writing code.** Just describe what you need, evaluate outputs, and let the system evolve better agents for you.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## The Problem

Building effective AI agents requires specialized expertise: prompt engineering, tool design, orchestration patterns. **Domain experts know exactly what "good" looks like** but can't translate that knowledge into agent configuration.

Training Camp removes this bottleneck.

## How It Works

You only need to do two things:

1. **Describe what you want** - "Summarize emails and highlight action items"
2. **Score the outputs** - Rate results 1-10, add feedback like "make it shorter"

The **Master Trainer** handles everything else: generating agents, creating variations, evolving configurations based on your feedback.

```
Your Need → AI Agents → Outputs → Your Scores → Better Agents → Better Outputs
                              ↑__________________________|
```

## Two Modes, One Goal

### Quick Start (Exploration)
*"Does this concept even work?"*

- Single agent, immediate generation
- Freeform feedback, fast iteration
- Validate ideas in seconds
- Promote to full training when ready

### Full Training (Optimization)
*"Which approach is best?"*

- 4 parallel agent lineages (A/B/C/D)
- Comparative scoring (1-10)
- Lock winners, regenerate the rest
- Systematic evolution toward your ideal

## Key Features

- **Zero Configuration** - No prompts to write, no tools to configure
- **Lineage-Based Evolution** - Agents improve through your evaluations
- **Lock & Explore** - Preserve winning agents while exploring alternatives
- **Directives** - Guide specific lineages ("use bullet points", "be more formal")
- **Export Ready** - Download agents as JSON, Python, or TypeScript
- **Multi-Model Support** - Claude, GPT, Gemini via LiteLLM

## Quick Start

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [VS Code](https://code.visualstudio.com/) with [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

### Setup

1. **Clone and open in VS Code**
   ```bash
   git clone https://github.com/Perttulands/ai-master-trainer.git
   cd training-camp
   code .
   ```

2. **Open in Dev Container**
   - Press `F1` → "Dev Containers: Reopen in Container"
   - Wait for the container to build (~2-3 minutes first time)

3. **Start the app**
   ```bash
   pnpm dev
   ```

4. **Configure your LLM** (in the app)
   - Click "Configure LLM" in the header
   - Enter your LiteLLM proxy URL and API key
   - Or use Mock Mode to explore without an API key

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Training Camp UI                        │
│   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │
│   │Lineage A│  │Lineage B│  │Lineage C│  │Lineage D│       │
│   └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘       │
│        │            │            │            │             │
│        └────────────┴─────┬──────┴────────────┘             │
│                           │                                  │
│                    ┌──────▼──────┐                          │
│                    │Master Trainer│  ← Evolves agents       │
│                    └──────┬──────┘    based on your scores  │
│                           │                                  │
│                    ┌──────▼──────┐                          │
│                    │   LiteLLM   │  ← Multi-model gateway   │
│                    └─────────────┘                          │
└─────────────────────────────────────────────────────────────┘
```

**Tech Stack:**
- React + TypeScript + Vite
- Tailwind CSS + Zustand
- SQLite (in-browser via sql.js)
- LiteLLM (Claude, GPT, Gemini support)

## Example Workflow

```
1. Start Quick Start
   └→ "Create weekly team update emails from project notes"

2. View first output
   └→ "Too formal, needs more personality"

3. Iterate
   └→ Agent evolves, new output appears

4. Satisfied? Promote to Training
   └→ 4 lineages spawn with different styles

5. Score outputs 1-10
   └→ Lineage A: 8 (professional), Lineage C: 9 (engaging)

6. Lock Lineage C, regenerate others
   └→ System evolves B and D to compete

7. Export winning agent
   └→ Download as TypeScript, deploy anywhere
```

## Development

```bash
pnpm dev          # Start dev server (port 5173)
pnpm build        # Production build
pnpm test         # Run tests
pnpm lint         # Lint code
```

## Documentation

- [Product Requirements](docs/PRD.md) - Full product specification
- [Architecture](docs/ARCHITECTURE.md) - Technical design
- [Agent Evolution](docs/SPEC-agent-evolution.md) - How agents improve

## Philosophy

**No mocks. No fallbacks. Real or nothing.**

Training Camp is built on the principle that training signal quality matters. If an LLM call fails, you see the error. If a feature isn't implemented, it throws. Half-working features with fake data are worse than no feature at all.

## License

MIT

---

<p align="center">
  <strong>Stop engineering prompts. Start training agents.</strong>
</p>
