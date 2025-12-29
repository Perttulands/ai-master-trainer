#!/usr/bin/env bash
set -euo pipefail

out_dir="/workspace/container-export/out/next-project-template"
rm -rf "$out_dir"
mkdir -p "$out_dir"

echo "Creating next-project template (generic, not a repo copy)..."

# 1) Dev container (sanitized)
mkdir -p "$out_dir/.devcontainer"

if [ -f "/workspace/.devcontainer/Dockerfile" ]; then
  cp -a "/workspace/.devcontainer/Dockerfile" "$out_dir/.devcontainer/"
fi
if [ -f "/workspace/.devcontainer/init-claude.sh" ]; then
  cp -a "/workspace/.devcontainer/init-claude.sh" "$out_dir/.devcontainer/"
fi

# Sanitize docker-compose.yml:
# - remove fixed volume names (avoid collisions)
# - remove env_file (avoid hard dependency on .env)
if [ -f "/workspace/.devcontainer/docker-compose.yml" ]; then
  awk '
    BEGIN { skip_env_file=0 }
    /^[[:space:]]*env_file:/ { skip_env_file=1; next }
    skip_env_file==1 {
      # consume the env_file list items (indented) then stop skipping
      if ($0 ~ /^[[:space:]]*-[[:space:]]+/) { next }
      skip_env_file=0
    }
    /^[[:space:]]*name:[[:space:]]+/ { next }
    { print }
  ' "/workspace/.devcontainer/docker-compose.yml" > "$out_dir/.devcontainer/docker-compose.yml"
fi

# Sanitize devcontainer.json:
# - use a generic name
# - avoid project-specific postCreateCommand steps (Tailwind init, specific pip packages)
# - make postCreateCommand resilient if package.json isn't present yet
if [ -f "/workspace/.devcontainer/devcontainer.json" ]; then
  node - <<'NODE'
const fs = require('fs');
const path = '/workspace/.devcontainer/devcontainer.json';
const outPath = '/workspace/container-export/out/next-project-template/.devcontainer/devcontainer.json';
const raw = fs.readFileSync(path, 'utf8');

// Allow jsonc (comments) by stripping // line comments and trailing commas conservatively.
// This is a tiny heuristic for this repo's file.
const withoutLineComments = raw.replace(/^\s*\/\/.*$/gm, '');
const withoutTrailingCommas = withoutLineComments
  .replace(/,\s*(\]|\})/g, '$1');

const data = JSON.parse(withoutTrailingCommas);
data.name = 'Project Dev Container';

// Resilient default setup:
data.postCreateCommand = [
  "if [ -f package.json ]; then pnpm install; else echo 'No package.json yet; skipping pnpm install'; fi",
  "if [ -f requirements.txt ]; then pip install --user -r requirements.txt; else true; fi",
  "echo 'Dev container ready'"
].join(' && ');

fs.writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n');
NODE
fi

# 2) Repo-level Claude prompts (commands/skills only; no local permission settings)
mkdir -p "$out_dir/.claude"
if [ -d "/workspace/.claude/commands" ]; then
  cp -a "/workspace/.claude/commands" "$out_dir/.claude/"
fi
if [ -d "/workspace/.claude/skills" ]; then
  cp -a "/workspace/.claude/skills" "$out_dir/.claude/"
fi

# 3) Optional env template (do not copy secrets)
cat > "$out_dir/.env.example" <<'EOF'
# Copy to .env and fill in values as needed.
# Keep .env out of git.

# Example:
# ANTHROPIC_API_KEY=
EOF

cat > "$out_dir/USAGE.md" <<'EOF'
# Using this template

1) Create a new repo/folder.
2) Copy `.devcontainer/` and `.claude/` from this template into the new repo.
3) Copy `.env.example` → `.env` (optional) and set environment variables.
4) Open in VS Code → “Dev Containers: Reopen in Container”.

Notes:
- This template intentionally does not include app code.
- `docker-compose.yml` in this template avoids fixed volume names, so each repo gets its own volumes automatically.
- `postCreateCommand` is resilient: it only runs `pnpm install` if `package.json` exists.
EOF

echo "Wrote template to: $out_dir"

# Also refresh the committed copy/paste folder (repo root)
committed_dir="/workspace/project-template"
rm -rf "$committed_dir"
mkdir -p "$committed_dir"
cp -a "$out_dir/." "$committed_dir/"
echo "Refreshed committed template folder: $committed_dir"
