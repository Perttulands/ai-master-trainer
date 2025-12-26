FROM mcr.microsoft.com/devcontainers/typescript-node:20

# Install pnpm globally
RUN npm install -g pnpm

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Install TypeScript language server for typescript-lsp plugin
RUN npm install -g typescript-language-server typescript

# Create claude config directory for credential persistence
RUN mkdir -p /home/node/.claude && chown -R node:node /home/node/.claude

# Create workspace directories with correct permissions
RUN mkdir -p /workspace/node_modules && chown -R node:node /workspace

# NOTE: Python packages installed in postCreateCommand (after Python feature applies)

# Set working directory
WORKDIR /workspace

# Switch to non-root user
USER node
