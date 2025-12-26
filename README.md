# Training Camp

Lineage-Based Interactive Training for AI Agents, Agentic Systems, and AI Skills.

## Quick Start with Dev Container

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [VS Code](https://code.visualstudio.com/) with [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

### Setup

1. **Clone and open in VS Code**
   ```bash
   git clone <repository-url>
   cd training-camp
   code .
   ```

2. **Open in Dev Container**
   - Press `F1` → "Dev Containers: Reopen in Container"
   - Or click the green button in the bottom-left corner → "Reopen in Container"
   - Wait for the container to build (first time takes a few minutes)

3. **Configure environment**
   ```bash
   # Copy the example env file (already done, but update with your keys)
   cp .env.example .env
   # Edit .env and add your ANTHROPIC_API_KEY
   ```

4. **Authenticate Claude Code (first time only)**
   ```bash
   claude login
   ```
   Your credentials will persist across container rebuilds.

5. **Start development**
   ```bash
   pnpm install
   pnpm dev
   ```

## Using Claude Code in the Container

Once authenticated, you can use Claude Code as an AI agent to work on the codebase:

```bash
# Start Claude Code CLI
claude

# Or run with a specific prompt
claude "Create the initial React app structure with TypeScript"
```

## Project Structure

```
training-camp/
├── .devcontainer/       # Dev container configuration
│   ├── devcontainer.json
│   ├── docker-compose.yml
│   └── Dockerfile
├── src/                 # Source code (to be created)
├── .env                 # Environment variables (gitignored)
├── .env.example         # Environment template
├── package.json         # Node.js dependencies
└── specifications.md    # Product requirements
```

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Database**: SQLite (MVP)
- **AI Integration**: Anthropic Claude API
- **Package Manager**: pnpm

## Development

### Available Scripts

```bash
pnpm dev      # Start dev server (port 5173)
pnpm build    # Build for production
pnpm preview  # Preview production build
pnpm lint     # Run ESLint
pnpm format   # Format with Prettier
```

### Ports

- `5173` - Vite dev server
- `3000` - Reserved for additional services

## Running Multiple Containers

Each container is fully isolated with its own:
- Workspace
- Claude Code credentials (named volume)
- Node modules

To run multiple instances, clone the project to different directories and open each in its own dev container.
