---
name: devcontainer-vscode
description: Configure and create VS Code devcontainers with Docker Compose. Use when setting up development containers, creating devcontainer.json, writing Dockerfiles for dev environments, configuring extensions, or troubleshooting container build issues.
allowed-tools: Read, Write, Edit, Grep, Glob, Bash, WebFetch
---

# VS Code Devcontainer Setup Guide

## BEFORE YOU START

**ALWAYS fetch current documentation before writing devcontainer configs:**

1. Features list: https://containers.dev/features
2. JSON schema: https://containers.dev/implementors/json_reference/
3. Base images: https://github.com/devcontainers/images/tree/main/src

This prevents errors from outdated information (package names, deprecated syntax, etc).

---

## CRITICAL RULES

### 1. Use Features, NOT apt-get for Language Runtimes

Features are tested, versioned, and cross-platform. Manual apt-get installs break because package names vary by OS version.

**WRONG:**
```dockerfile
RUN apt-get install -y python3.11  # May not exist in base image's OS
```

**CORRECT:**
```json
"features": {
  "ghcr.io/devcontainers/features/python:1": { "version": "3.12" }
}
```

### 2. No `version:` in docker-compose.yml

```yaml
# WRONG - causes warning, will be ignored
version: '3.8'
services:
  ...

# CORRECT - just start with services
services:
  ...
```

### 3. Keep Container Running

```yaml
services:
  dev:
    command: sleep infinity  # Required or container exits
```

### 4. Use `:cached` for Workspace Mounts

```yaml
volumes:
  - ..:/workspace:cached  # Better performance, especially on macOS
```

### 5. Features Apply AFTER Dockerfile - Don't Use Feature Tools in Dockerfile

Features (like Python) are installed **after** the Dockerfile runs. You cannot use `pip`, `python`, etc. in Dockerfile if Python comes from a feature.

**WRONG:**
```dockerfile
# Dockerfile
RUN pip install requests  # FAILS - pip doesn't exist yet!
```

**CORRECT:**
```json
// devcontainer.json
"postCreateCommand": "pip install requests"  // Works - features already applied
```

---

## DOCUMENTATION LINKS

When setting up a devcontainer, fetch these for current info:

| Resource | URL | Use For |
|----------|-----|---------|
| Features List | https://containers.dev/features | Available features and options |
| JSON Reference | https://containers.dev/implementors/json_reference/ | Schema and properties |
| Base Images | https://github.com/devcontainers/images | Official image list |
| VS Code Docs | https://code.visualstudio.com/docs/devcontainers/containers | Extension behavior |
| Feature Options | https://github.com/devcontainers/features/tree/main/src/{feature-name} | Specific feature params |

---

## FILE STRUCTURE

```
project/
├── .devcontainer/
│   ├── devcontainer.json   # Required - main config
│   ├── docker-compose.yml  # Optional - for volumes, networks
│   └── Dockerfile          # Optional - custom image
├── .env                    # Environment variables
└── ... project files
```

**Simple projects**: Just `devcontainer.json` with `image:` is enough
**Complex projects**: Use docker-compose.yml for persistent volumes

---

## TEMPLATES BY USE CASE

### Minimal (Image Only)

For simple projects without persistence needs:

```json
{
  "name": "Project Name",
  "image": "mcr.microsoft.com/devcontainers/base:ubuntu",
  "features": {
    "ghcr.io/devcontainers/features/python:1": {}
  },
  "postCreateCommand": "pip install -r requirements.txt || true"
}
```

### With Docker Compose (Persistent Volumes)

For projects needing credential/data persistence:

**devcontainer.json:**
```json
{
  "name": "Project Name",
  "dockerComposeFile": "docker-compose.yml",
  "service": "dev",
  "workspaceFolder": "/workspace",
  "features": {},
  "postCreateCommand": "echo 'Ready'",
  "remoteUser": "vscode"
}
```

**docker-compose.yml:**
```yaml
services:
  dev:
    build:
      context: .
      dockerfile: Dockerfile
    volumes:
      - ..:/workspace:cached
    command: sleep infinity

volumes: {}
```

**Dockerfile:**
```dockerfile
FROM mcr.microsoft.com/devcontainers/base:ubuntu
WORKDIR /workspace
```

---

## BASE IMAGES

| Image | Use Case |
|-------|----------|
| `mcr.microsoft.com/devcontainers/base:ubuntu` | General purpose, minimal |
| `mcr.microsoft.com/devcontainers/base:debian` | Debian-based, minimal |
| `mcr.microsoft.com/devcontainers/typescript-node:20` | Node.js + TypeScript |
| `mcr.microsoft.com/devcontainers/javascript-node:20` | Node.js |
| `mcr.microsoft.com/devcontainers/python:3` | Python |
| `mcr.microsoft.com/devcontainers/go:1` | Go |
| `mcr.microsoft.com/devcontainers/rust:1` | Rust |
| `mcr.microsoft.com/devcontainers/java:21` | Java |
| `mcr.microsoft.com/devcontainers/dotnet:8.0` | .NET |
| `mcr.microsoft.com/devcontainers/universal:2` | Multi-language (large) |

---

## FEATURES REFERENCE

**Always check https://containers.dev/features for current options.**

### Languages

```json
"ghcr.io/devcontainers/features/python:1": {
  "version": "3.12",        // "3.11", "3.10", "os-provided"
  "installTools": true      // pip tools: black, flake8, mypy, pytest
}

"ghcr.io/devcontainers/features/node:1": {
  "version": "20",          // Node version
  "pnpm": true,             // Install pnpm
  "yarn": true              // Install yarn
}

"ghcr.io/devcontainers/features/go:1": {
  "version": "1.22"
}

"ghcr.io/devcontainers/features/rust:1": {
  "version": "latest"
}

"ghcr.io/devcontainers/features/java:1": {
  "version": "21",
  "installMaven": true,
  "installGradle": true
}

"ghcr.io/devcontainers/features/dotnet:2": {
  "version": "8.0"
}

"ghcr.io/devcontainers/features/ruby:1": {
  "version": "3.2"
}

"ghcr.io/devcontainers/features/php:1": {
  "version": "8.2"
}
```

### Tools & CLIs

```json
"ghcr.io/devcontainers/features/common-utils:2": {
  "installZsh": true,
  "installOhMyZsh": true,
  "configureZshAsDefaultShell": true
}

"ghcr.io/devcontainers/features/git:1": {}

"ghcr.io/devcontainers/features/github-cli:1": {}

"ghcr.io/devcontainers/features/azure-cli:1": {}

"ghcr.io/devcontainers/features/aws-cli:1": {}

"ghcr.io/devcontainers/features/docker-in-docker:2": {}

"ghcr.io/devcontainers/features/kubectl-helm-minikube:1": {}

"ghcr.io/devcontainers/features/terraform:1": {}

"ghcr.io/devcontainers/features/powershell:1": {}
```

---

## EXAMPLE CONFIGURATIONS

### Python Data Science / Office Automation

For Python scripts, Jupyter, Office file manipulation (openpyxl, python-pptx, python-docx):

```json
{
  "name": "Python Automation",
  "image": "mcr.microsoft.com/devcontainers/python:3",
  "features": {
    "ghcr.io/devcontainers/features/common-utils:2": {}
  },
  "customizations": {
    "vscode": {
      "extensions": [
        "ms-python.python",
        "ms-python.vscode-pylance",
        "ms-toolsai.jupyter"
      ]
    }
  },
  "postCreateCommand": "pip install openpyxl python-pptx python-docx pandas jupyter"
}
```

### Web Development (React/Vue/Svelte)

```json
{
  "name": "Web Dev",
  "dockerComposeFile": "docker-compose.yml",
  "service": "dev",
  "workspaceFolder": "/workspace",
  "features": {
    "ghcr.io/devcontainers/features/node:1": {
      "version": "20",
      "pnpm": true
    }
  },
  "customizations": {
    "vscode": {
      "extensions": [
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode",
        "bradlc.vscode-tailwindcss"
      ]
    }
  },
  "forwardPorts": [3000, 5173],
  "postCreateCommand": "pnpm install || npm install || true"
}
```

### Full-Stack (Node + Python)

```json
{
  "name": "Full Stack",
  "dockerComposeFile": "docker-compose.yml",
  "service": "dev",
  "workspaceFolder": "/workspace",
  "features": {
    "ghcr.io/devcontainers/features/python:1": {
      "version": "3.12",
      "installTools": true
    },
    "ghcr.io/devcontainers/features/node:1": {
      "version": "20"
    },
    "ghcr.io/devcontainers/features/common-utils:2": {}
  },
  "customizations": {
    "vscode": {
      "extensions": [
        "ms-python.python",
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode"
      ]
    }
  },
  "forwardPorts": [3000, 5173, 8000]
}
```

### .NET / C#

```json
{
  "name": "DotNet",
  "image": "mcr.microsoft.com/devcontainers/dotnet:8.0",
  "features": {
    "ghcr.io/devcontainers/features/common-utils:2": {}
  },
  "customizations": {
    "vscode": {
      "extensions": [
        "ms-dotnettools.csharp",
        "ms-dotnettools.vscode-dotnet-runtime"
      ]
    }
  },
  "forwardPorts": [5000, 5001]
}
```

### Go

```json
{
  "name": "Go Dev",
  "image": "mcr.microsoft.com/devcontainers/go:1",
  "features": {
    "ghcr.io/devcontainers/features/common-utils:2": {}
  },
  "customizations": {
    "vscode": {
      "extensions": ["golang.go"]
    }
  }
}
```

### Rust

```json
{
  "name": "Rust Dev",
  "image": "mcr.microsoft.com/devcontainers/rust:1",
  "features": {
    "ghcr.io/devcontainers/features/common-utils:2": {}
  },
  "customizations": {
    "vscode": {
      "extensions": ["rust-lang.rust-analyzer"]
    }
  }
}
```

### Multi-Container (App + Database)

```json
{
  "name": "App with DB",
  "dockerComposeFile": "docker-compose.yml",
  "service": "app",
  "workspaceFolder": "/workspace",
  "features": {},
  "forwardPorts": [3000, 5432]
}
```

**docker-compose.yml:**
```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    volumes:
      - ..:/workspace:cached
    depends_on:
      - db
    command: sleep infinity

  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: app
    volumes:
      - postgres-data:/var/lib/postgresql/data

volumes:
  postgres-data:
```

---

## PERSISTENT VOLUMES

Use named volumes for data that should survive container rebuilds:

```yaml
services:
  dev:
    volumes:
      - ..:/workspace:cached              # Project files
      - credentials:/home/vscode/.config  # CLI credentials
      - node-modules:/workspace/node_modules  # Dependencies

volumes:
  credentials:
    name: project-credentials
  node-modules:
    name: project-node-modules
```

**Common things to persist:**
- `~/.claude` - Claude Code credentials
- `~/.config` - Various CLI configs
- `~/.aws` - AWS credentials
- `~/.azure` - Azure credentials
- `node_modules` - Performance optimization
- Database data directories

---

## VS CODE EXTENSIONS

Format: `publisher.extension-name`

| Extension ID | Description |
|-------------|-------------|
| `ms-python.python` | Python |
| `ms-python.vscode-pylance` | Python IntelliSense |
| `ms-toolsai.jupyter` | Jupyter notebooks |
| `dbaeumer.vscode-eslint` | ESLint |
| `esbenp.prettier-vscode` | Prettier |
| `bradlc.vscode-tailwindcss` | Tailwind CSS |
| `golang.go` | Go |
| `rust-lang.rust-analyzer` | Rust |
| `ms-dotnettools.csharp` | C# |
| `redhat.java` | Java |
| `formulahendry.auto-rename-tag` | HTML tag renaming |
| `christian-kohler.path-intellisense` | Path autocomplete |
| `usernamehw.errorlens` | Inline errors |
| `eamodio.gitlens` | Git tools |

---

## COMMON ISSUES & SOLUTIONS

### Package not found
**Error:** `E: Unable to locate package python3.11`
**Cause:** Package names vary by base image OS version
**Fix:** Use features instead of apt-get

### Container exits immediately
**Error:** Container stops right after starting
**Fix:** Add `command: sleep infinity` to docker-compose.yml

### Permission denied on volumes
**Error:** Cannot write to mounted directory
**Fix:** Ensure directory exists with correct ownership:
```dockerfile
RUN mkdir -p /home/vscode/.config && chown -R vscode:vscode /home/vscode/.config
```

### Extensions not installing
**Symptom:** Extensions missing after build
**Cause:** Extension IDs are case-sensitive
**Fix:** Check exact ID from VS Code marketplace

### docker-compose version warning
**Warning:** `the attribute 'version' is obsolete`
**Fix:** Remove `version: '3.8'` line entirely

### Slow file operations
**Symptom:** Slow on macOS/Windows
**Fix:** Use `:cached` on workspace mount

### postCreateCommand fails
**Symptom:** Container fails to start
**Fix:** Add `|| true` to make command non-fatal:
```json
"postCreateCommand": "npm install || true"
```

### Feature not applying
**Symptom:** Language/tool not available
**Cause:** Features apply after Dockerfile build
**Fix:** Don't override in Dockerfile what features provide

### pip not found in Dockerfile
**Error:** `/bin/sh: 1: pip: not found`
**Cause:** Python is installed via feature, which runs AFTER Dockerfile
**Fix:** Move pip install to postCreateCommand:
```json
"postCreateCommand": "pip install package-name"
```

---

## LIFECYCLE COMMANDS

| Command | When | Use For |
|---------|------|---------|
| `initializeCommand` | Before container created | Host setup |
| `onCreateCommand` | After container created (once) | One-time setup |
| `updateContentCommand` | After clone/pull | Rebuild dependencies |
| `postCreateCommand` | After all create steps | Install dependencies |
| `postStartCommand` | Every container start | Start services |
| `postAttachCommand` | When VS Code attaches | User notifications |

---

## DEBUGGING

### Test Docker build manually
```bash
cd .devcontainer
docker compose build
```

### Check container logs
VS Code: "Dev Containers: Show Container Log"

### Enter running container
```bash
docker exec -it <container-id> bash
```

### Rebuild without cache
VS Code: "Dev Containers: Rebuild Container Without Cache"
