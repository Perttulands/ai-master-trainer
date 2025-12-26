FROM mcr.microsoft.com/devcontainers/typescript-node:20

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

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
