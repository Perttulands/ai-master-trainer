# Using this template

1) Create a new repo/folder.
2) Copy `.devcontainer/` and `.claude/` from this template into the new repo.
3) Copy `.env.example` → `.env` (optional) and set environment variables.
4) Open in VS Code → “Dev Containers: Reopen in Container”.

Notes:
- This template intentionally does not include app code.
- `docker-compose.yml` in this template avoids fixed volume names, so each repo gets its own volumes automatically.
- `postCreateCommand` is resilient: it only runs `pnpm install` if `package.json` exists.
