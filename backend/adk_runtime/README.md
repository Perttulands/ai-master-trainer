# ADK Runtime (LiteLLM via Google ADK)

This service provides:

- OpenAI-compatible runtime endpoint: `POST /v1/chat/completions`
- Stateful orchestration API for Training Camp sessions/lineages

Both are backed by Google ADK + LiteLLM.

## Setup

```bash
cd backend/adk_runtime
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Configuration

Required for LiteLLM gateway mode:

```bash
export ADK_LITELLM_API_BASE="https://your-litellm-gateway.com"
export ADK_LITELLM_API_KEY="your-litellm-api-key"
```

Optional:

```bash
export ADK_APP_NAME="training-camp-adk-runtime"
export ADK_DEFAULT_MODEL="anthropic/claude-4-5-sonnet-aws"
export ADK_STATE_DB=".adk-runtime/state.db"

# Prefix applied to incoming model IDs before passing to ADK LiteLlm.
# Example: with prefix openai/, "anthropic/claude-4-5-sonnet-aws"
# becomes "openai/anthropic/claude-4-5-sonnet-aws".
export ADK_MODEL_PREFIX=""

export ADK_DEFAULT_SYSTEM_PROMPT="You are a helpful AI assistant."
```

## Run

```bash
uvicorn adk_runtime.main:app --host 0.0.0.0 --port 8000 --reload
```

## Endpoints

- `GET /health`
- `POST /v1/chat/completions`

Orchestration API (stateful):

- `GET /api/sessions`
- `GET /api/sessions/{session_id}`
- `GET /api/sessions/{session_id}/history`
- `POST /api/sessions`
- `PATCH /api/sessions/{session_id}`
- `DELETE /api/sessions/{session_id}`
- `POST /api/sessions/{session_id}/lineages`
- `POST /api/sessions/{session_id}/run`
- `POST /api/artifacts/{artifact_id}/evaluate`
- `POST /api/sessions/{session_id}/iterate`
- `POST /api/sessions/{session_id}/lineages/{label}/lock`
- `POST /api/sessions/{session_id}/lineages/{label}/directives`

State is stored in SQLite at `ADK_STATE_DB`.
