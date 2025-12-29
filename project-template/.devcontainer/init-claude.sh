#!/bin/bash
set -e

echo "=== Setting up Claude Code environment ==="

# Ensure .claude directory exists with correct permissions
mkdir -p /home/node/.claude
chown -R node:node /home/node/.claude

# Add the official Anthropic plugins marketplace
echo "Adding official Anthropic plugins marketplace..."
claude /plugin marketplace add anthropics/claude-plugins-official 2>/dev/null || true

# Install recommended plugins for this project
echo "Installing plugins..."
PLUGINS=(
  "typescript-lsp@claude-plugin-directory"
  "frontend-design@claude-plugin-directory"
  "code-review@claude-plugin-directory"
  "agent-sdk-dev@claude-plugin-directory"
)

for plugin in "${PLUGINS[@]}"; do
  echo "  Installing $plugin..."
  claude /plugin install "$plugin" 2>/dev/null || echo "  Warning: Could not install $plugin"
done

echo "=== Claude Code setup complete ==="
echo ""
echo "Available plugins:"
echo "  - typescript-lsp: TypeScript language server"
echo "  - frontend-design: Production-grade UI generation"
echo "  - code-review: Multi-agent code review (/code-review)"
echo "  - agent-sdk-dev: Agent SDK scaffolding (/new-sdk-app)"
echo ""
echo "Run 'claude' to start Claude Code CLI"
