# ADK Runtime (LiteLLM via Google ADK)

This service provides an OpenAI-compatible `POST /v1/chat/completions` endpoint backed by Google ADK + LiteLLM.

It lets the existing Training Camp frontend switch to ADK runtime without changing request payload shapes.

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
- `POST /api/sessions`
- `POST /api/sessions/{session_id}/run`
- `POST /api/artifacts/{artifact_id}/evaluate`
- `POST /api/sessions/{session_id}/iterate`
- `POST /api/sessions/{session_id}/lineages/{label}/lock`

State is stored in SQLite at `ADK_STATE_DB`.
