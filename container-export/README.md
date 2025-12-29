# container-export

Small helper scripts to turn this repo’s **Dev Container + Claude workflow setup** into a **reusable template** for your next (similar) project.

This is intentionally **not** a full copy of the repo. The goal is a clean, general starting point.

Outputs go to `container-export/out/` (which is gitignored). Treat any `*.tgz` as secret.

If you previously created `out/claude-home.tgz` and don’t want it around, delete it.

## Quick start

From inside the dev container (workspace root):

- Export repo-level Claude prompts (commands/skills):
  - `bash container-export/export-claude.sh`
- Generate/refresh the reusable project template folder you can copy/paste:
  - `bash container-export/export-next-project-bundle.sh`
  - Result: `project-template/` (copy this into your next repo)
- (Optional) Export your Claude *home* credentials archive:
  - `bash container-export/export-claude.sh --include-home`

All outputs land in `container-export/out/`.

## What gets exported

- **Project template output**: `out/next-project-template/` (build output)
  - Also copied into `project-template/` (the folder you actually copy/paste)
  - `.devcontainer/` (sanitized to be generic; no project-specific volume names; no required `.env`)
  - `.claude/` (repo prompts: `commands/`, `skills/`; excludes local permission settings)
- **Repo Claude prompts**: `/workspace/.claude` → `out/claude-repo/`
- **(Optional) Claude home archive**: `/home/node/.claude` → `out/claude-home.tgz`
  - This may contain auth tokens/credentials.

## What is intentionally NOT exported

- Your app code (`src/`), project docs (`docs/`), database files, test artifacts.
- Your real `.env` (only an optional `.env.example` is created).
- Local Claude permissions file `.claude/settings.local.json` (it’s per-user / per-machine).

## Using the exports in the next project

1. Create a new repo/folder.
2. Copy `out/next-project-template/.devcontainer` and `out/next-project-template/.claude` into it.
3. Optionally copy `out/next-project-template/.env.example` → `.env` and edit.
4. Open the new folder in VS Code → “Dev Containers: Reopen in Container”.

If you also import `claude-home.tgz`, do so carefully:
- Only extract it if you *intend* to reuse the same Claude auth on that machine.
- Treat the archive as a secret.
