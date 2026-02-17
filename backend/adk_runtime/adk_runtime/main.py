from __future__ import annotations

import asyncio
import os
import time
import uuid
from dataclasses import dataclass
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai.types import Content, Part
from pydantic import BaseModel, ConfigDict, Field

from .store import RuntimeStore


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    model: str
    messages: list[ChatMessage]
    max_tokens: int | None = None
    temperature: float | None = None
    top_p: float | None = None


class ChatCompletionChoice(BaseModel):
    index: int
    message: ChatMessage
    finish_reason: str = "stop"


class Usage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class ChatCompletionResponse(BaseModel):
    id: str
    object: str = "chat.completion"
    created: int
    model: str
    choices: list[ChatCompletionChoice]
    usage: Usage


@dataclass(frozen=True)
class RuntimeSettings:
    app_name: str
    litellm_api_base: str | None
    litellm_api_key: str | None
    model_prefix: str
    default_instruction: str
    default_model: str
    state_db_path: str


def load_settings() -> RuntimeSettings:
    return RuntimeSettings(
        app_name=os.getenv("ADK_APP_NAME", "training-camp-adk-runtime"),
        litellm_api_base=os.getenv("ADK_LITELLM_API_BASE"),
        litellm_api_key=os.getenv("ADK_LITELLM_API_KEY"),
        model_prefix=os.getenv("ADK_MODEL_PREFIX", ""),
        default_instruction=os.getenv(
            "ADK_DEFAULT_SYSTEM_PROMPT",
            "You are a helpful AI assistant.",
        ),
        default_model=os.getenv(
            "ADK_DEFAULT_MODEL",
            "anthropic/claude-4-5-sonnet-aws",
        ),
        state_db_path=os.getenv("ADK_STATE_DB", ".adk-runtime/state.db"),
    )


SETTINGS = load_settings()
SESSION_SERVICE = InMemorySessionService()
STORE = RuntimeStore(SETTINGS.state_db_path)


app = FastAPI(title="Training Camp ADK Runtime", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "runtime": "adk",
        "orchestration": "enabled",
        "stateDb": SETTINGS.state_db_path,
    }


def _resolve_model_name(model: str) -> str:
    prefix = SETTINGS.model_prefix.strip()
    if prefix and not model.startswith(prefix):
        return f"{prefix}{model}"
    return model


def _split_instruction_and_prompt(messages: list[ChatMessage]) -> tuple[str, str]:
    instruction = SETTINGS.default_instruction
    non_system_messages: list[ChatMessage] = []

    for message in messages:
        role = message.role.strip().lower()
        content = message.content.strip()
        if not content:
            continue
        if role == "system":
            instruction = content
            continue
        non_system_messages.append(ChatMessage(role=role, content=content))

    if not non_system_messages:
        raise HTTPException(
            status_code=400,
            detail="At least one non-system message is required.",
        )

    if len(non_system_messages) == 1 and non_system_messages[0].role == "user":
        return instruction, non_system_messages[0].content

    transcript_lines = [
        "Conversation transcript:",
        "Respond as the assistant to the latest user turn.",
        "",
    ]
    for message in non_system_messages:
        transcript_lines.append(f"{message.role.upper()}: {message.content}")
    transcript_lines.append("")
    transcript_lines.append("ASSISTANT:")
    return instruction, "\n".join(transcript_lines)


def _extract_text_from_content(content: Any) -> str:
    if content is None:
        return ""
    parts = getattr(content, "parts", None)
    if not parts:
        return ""
    chunks: list[str] = []
    for part in parts:
        text = getattr(part, "text", None)
        if text:
            chunks.append(text)
    return "\n".join(chunks).strip()


async def _generate_with_adk(
    *,
    model: str,
    instruction: str,
    prompt: str,
    max_tokens: int | None,
    temperature: float | None,
    top_p: float | None,
) -> str:
    model_kwargs: dict[str, Any] = {"model": _resolve_model_name(model)}
    if SETTINGS.litellm_api_base:
        model_kwargs["api_base"] = SETTINGS.litellm_api_base
    if SETTINGS.litellm_api_key:
        model_kwargs["api_key"] = SETTINGS.litellm_api_key
    if max_tokens is not None:
        model_kwargs["max_tokens"] = max_tokens
    if temperature is not None:
        model_kwargs["temperature"] = temperature
    if top_p is not None:
        model_kwargs["top_p"] = top_p

    agent = LlmAgent(
        name="training_camp_agent",
        model=LiteLlm(**model_kwargs),
        instruction=instruction,
    )

    runner = Runner(
        app_name=SETTINGS.app_name,
        agent=agent,
        session_service=SESSION_SERVICE,
    )

    session_id = f"s_{uuid.uuid4().hex}"
    user_id = "training-camp-ui"
    await SESSION_SERVICE.create_session(
        app_name=SETTINGS.app_name,
        user_id=user_id,
        session_id=session_id,
    )

    prompt_content = Content(role="user", parts=[Part(text=prompt)])
    final_text = ""
    async for event in runner.run_async(
        user_id=user_id,
        session_id=session_id,
        new_message=prompt_content,
    ):
        if hasattr(event, "is_final_response") and event.is_final_response():
            text = _extract_text_from_content(getattr(event, "content", None))
            if text:
                final_text = text

    if not final_text:
        raise RuntimeError("ADK returned an empty response.")

    return final_text


@app.post("/v1/chat/completions", response_model=ChatCompletionResponse)
async def chat_completions(request: ChatCompletionRequest) -> ChatCompletionResponse:
    try:
        instruction, prompt = _split_instruction_and_prompt(request.messages)
        output = await _generate_with_adk(
            model=request.model,
            instruction=instruction,
            prompt=prompt,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            top_p=request.top_p,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return ChatCompletionResponse(
        id=f"chatcmpl_{uuid.uuid4().hex}",
        created=int(time.time()),
        model=request.model,
        choices=[
            ChatCompletionChoice(
                index=0,
                message=ChatMessage(role="assistant", content=output),
                finish_reason="stop",
            )
        ],
        usage=Usage(),
    )


class StrategyConfig(BaseModel):
    tag: str
    description: str
    style: str
    temperature: float


STRATEGIES: dict[str, StrategyConfig] = {
    "A": StrategyConfig(
        tag="Concise",
        description="Focused on clear, brief responses.",
        style="brief and direct",
        temperature=0.3,
    ),
    "B": StrategyConfig(
        tag="Detailed",
        description="Comprehensive and thorough responses.",
        style="thorough and comprehensive",
        temperature=0.5,
    ),
    "C": StrategyConfig(
        tag="Creative",
        description="Inventive and engaging responses.",
        style="creative with fresh perspectives",
        temperature=0.9,
    ),
    "D": StrategyConfig(
        tag="Analytical",
        description="Structured and logical responses.",
        style="structured and analytical",
        temperature=0.4,
    ),
    "E": StrategyConfig(
        tag="Empathetic",
        description="Warm and supportive responses.",
        style="empathetic and supportive",
        temperature=0.6,
    ),
    "F": StrategyConfig(
        tag="Formal",
        description="Professional and polished responses.",
        style="formal and professional",
        temperature=0.4,
    ),
    "G": StrategyConfig(
        tag="Casual",
        description="Conversational and approachable responses.",
        style="casual and friendly",
        temperature=0.7,
    ),
    "H": StrategyConfig(
        tag="Hybrid",
        description="Balanced style adaptable to context.",
        style="balanced and adaptive",
        temperature=0.5,
    ),
}

AGENT_GENERATION_SYSTEM_PROMPT = """You are an expert AI agent architect.

Create a high-quality SYSTEM PROMPT for an AI agent based on the need and strategy.
Return only the system prompt text.
"""

AGENT_EVOLUTION_SYSTEM_PROMPT = """You are an expert AI agent evolver.

Improve the system prompt based on scores and feedback.
- Scores 8-10: refine and polish
- Scores 5-7: moderate improvements
- Scores 1-4: significant changes

Return only the evolved system prompt text.
"""


def _resolve_runtime_model(model: str | None) -> str:
    chosen = (model or SETTINGS.default_model).strip()
    return chosen or SETTINGS.default_model


def _pick_labels(count: int) -> list[str]:
    labels = list(STRATEGIES.keys())
    return labels[:count]


def _default_input_prompt(need: str, input_prompt: str | None) -> str:
    if input_prompt and input_prompt.strip():
        return input_prompt.strip()
    return f"Please help with the following task: {need}"


async def _generate_system_prompt(
    *,
    need: str,
    constraints: str | None,
    strategy: StrategyConfig,
    model: str,
) -> str:
    prompt = (
        f'Need: "{need}"\n'
        f"Strategy: {strategy.tag} - {strategy.description}\n"
        f"Style: {strategy.style}\n"
    )
    if constraints:
        prompt += f"Constraints: {constraints}\n"
    prompt += "\nGenerate the system prompt:"
    return await _generate_with_adk(
        model=model,
        instruction=AGENT_GENERATION_SYSTEM_PROMPT,
        prompt=prompt,
        max_tokens=700,
        temperature=0.7,
        top_p=0.95,
    )


async def _execute_agent(
    *,
    model: str,
    system_prompt: str,
    user_input: str,
    temperature: float,
    max_tokens: int,
) -> tuple[str, int]:
    start = time.perf_counter()
    output = await _generate_with_adk(
        model=model,
        instruction=system_prompt,
        prompt=user_input,
        max_tokens=max_tokens,
        temperature=temperature,
        top_p=0.95,
    )
    duration_ms = int((time.perf_counter() - start) * 1000)
    return output, duration_ms


async def _evolve_system_prompt(
    *,
    model: str,
    current_prompt: str,
    score: int,
    comment: str | None,
    sticky: list[str],
    oneshot: list[str],
) -> str:
    prompt = (
        f"Current system prompt:\n---\n{current_prompt}\n---\n\n"
        f"Score: {score}/10\n"
        f"Comment: {comment or '(none)'}\n"
        f"Sticky directives: {'; '.join(sticky) if sticky else '(none)'}\n"
        f"One-shot directives: {'; '.join(oneshot) if oneshot else '(none)'}\n\n"
        "Evolve this prompt."
    )
    return await _generate_with_adk(
        model=model,
        instruction=AGENT_EVOLUTION_SYSTEM_PROMPT,
        prompt=prompt,
        max_tokens=900,
        temperature=0.7 if score >= 5 else 0.9,
        top_p=0.95,
    )


def _resolve_strategy(
    *,
    label: str,
    tag: str | None,
    description: str | None,
    style: str | None,
    temperature: float | None,
) -> StrategyConfig:
    base = STRATEGIES.get(label)
    return StrategyConfig(
        tag=(tag or (base.tag if base else f"Lineage {label}")).strip(),
        description=(description or (base.description if base else f"Strategy for lineage {label}")).strip(),
        style=(style or (base.style if base else "balanced and adaptive")).strip(),
        temperature=temperature if temperature is not None else (base.temperature if base else 0.7),
    )


async def _create_lineage_and_initial_artifact(
    *,
    session_id: str,
    need: str,
    constraints: str | None,
    input_prompt: str | None,
    label: str,
    strategy: StrategyConfig,
    model: str,
) -> None:
    lineage = STORE.create_lineage(
        session_id=session_id,
        label=label,
        strategy_tag=strategy.tag,
    )

    system_prompt = await _generate_system_prompt(
        need=need,
        constraints=constraints,
        strategy=strategy,
        model=model,
    )

    agent = STORE.create_agent(
        lineage_id=lineage["id"],
        version=1,
        name=f"{strategy.tag} Agent",
        description=strategy.description,
        system_prompt=system_prompt.strip(),
        parameters={
            "model": model,
            "temperature": strategy.temperature,
            "maxTokens": 2048,
            "topP": 0.95,
        },
    )

    run_input = _default_input_prompt(need, input_prompt)
    output, duration_ms = await _execute_agent(
        model=model,
        system_prompt=agent["systemPrompt"],
        user_input=run_input,
        temperature=float(agent["parameters"]["temperature"]),
        max_tokens=int(agent["parameters"]["maxTokens"]),
    )

    STORE.create_artifact(
        lineage_id=lineage["id"],
        cycle=1,
        content=output,
        metadata={
            "agentId": agent["id"],
            "agentVersion": 1,
            "executionSuccess": True,
            "executionTimeMs": duration_ms,
            "inputUsed": run_input,
        },
    )


class CreateSessionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    need: str
    constraints: str | None = None
    input_prompt: str | None = Field(default=None, alias="inputPrompt")
    initial_agent_count: int = Field(default=4, alias="initialAgentCount")
    model: str | None = None
    strategies: list["CustomStrategyInput"] | None = None


class CustomStrategyInput(BaseModel):
    label: str
    name: str
    description: str
    style: str
    temperature: float | None = None


class RunLineageRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    lineage_label: str = Field(alias="lineageLabel")
    input: str
    model: str | None = None


class EvaluateArtifactRequest(BaseModel):
    score: int = Field(ge=1, le=10)
    comment: str | None = None


class IterateSessionRequest(BaseModel):
    model: str | None = None


class SetLineageLockRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    is_locked: bool = Field(alias="isLocked")


class UpdateSessionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str | None = None
    need: str | None = None
    constraints: str | None = None
    input_prompt: str | None = Field(default=None, alias="inputPrompt")
    trainer_messages: list[dict[str, Any]] | None = Field(
        default=None,
        alias="trainerMessages",
    )


class AddLineageRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    label: str
    strategy_tag: str | None = Field(default=None, alias="strategyTag")
    strategy_description: str | None = Field(default=None, alias="strategyDescription")
    strategy_style: str | None = Field(default=None, alias="strategyStyle")
    temperature: float | None = None
    model: str | None = None


class UpdateLineageDirectivesRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    directive_sticky: list[str] | None = Field(default=None, alias="directiveSticky")
    directive_oneshot: list[str] | None = Field(default=None, alias="directiveOneshot")


@app.get("/api/sessions")
async def list_sessions() -> dict[str, Any]:
    sessions = STORE.list_sessions()
    return {
        "sessions": [
            {
                "id": s.id,
                "name": s.name,
                "need": s.need,
                "constraints": s.constraints,
                "inputPrompt": s.input_prompt,
                "initialAgentCount": s.initial_agent_count,
                "createdAt": s.created_at,
                "updatedAt": s.updated_at,
            }
            for s in sessions
        ]
    }


@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str) -> dict[str, Any]:
    snapshot = STORE.build_session_snapshot(session_id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found.")
    return snapshot


@app.get("/api/sessions/{session_id}/history")
async def get_session_history(session_id: str) -> dict[str, Any]:
    history = STORE.build_session_history(session_id)
    if history is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found.")
    return history


@app.patch("/api/sessions/{session_id}")
async def patch_session(
    session_id: str, request: UpdateSessionRequest
) -> dict[str, Any]:
    updates: dict[str, Any] = {}
    provided = request.model_fields_set

    if "name" in provided:
        updates["name"] = (request.name or "").strip()
    if "need" in provided:
        updates["need"] = (request.need or "").strip()
    if "constraints" in provided:
        updates["constraints"] = request.constraints.strip() if request.constraints else None
    if "input_prompt" in provided:
        updates["input_prompt"] = request.input_prompt.strip() if request.input_prompt else None
    if "trainer_messages" in provided:
        updates["trainer_messages"] = request.trainer_messages or []

    if not updates:
        raise HTTPException(status_code=400, detail="No session updates provided.")
    if "name" in updates and not updates["name"]:
        raise HTTPException(status_code=400, detail="Session name cannot be empty.")
    if "need" in updates and not updates["need"]:
        raise HTTPException(status_code=400, detail="Session need cannot be empty.")

    session = STORE.update_session(session_id, **updates)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found.")
    return {
        "session": {
            "id": session.id,
            "name": session.name,
            "need": session.need,
            "constraints": session.constraints,
            "inputPrompt": session.input_prompt,
            "initialAgentCount": session.initial_agent_count,
            "trainerMessages": session.trainer_messages,
            "createdAt": session.created_at,
            "updatedAt": session.updated_at,
        }
    }


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str) -> dict[str, bool]:
    deleted = STORE.delete_session(session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found.")
    return {"deleted": True}


@app.post("/api/sessions")
async def create_session(request: CreateSessionRequest) -> dict[str, Any]:
    custom_strategies = request.strategies or []
    count = len(custom_strategies) if custom_strategies else request.initial_agent_count
    if count < 1 or count > 8:
        raise HTTPException(status_code=400, detail="initialAgentCount must be between 1 and 8.")

    model = _resolve_runtime_model(request.model)
    session = STORE.create_session(
        name=request.name.strip(),
        need=request.need.strip(),
        constraints=request.constraints.strip() if request.constraints else None,
        input_prompt=request.input_prompt.strip() if request.input_prompt else None,
        initial_agent_count=count,
    )

    labels = (
        _pick_labels(count)
        if not custom_strategies
        else [s.label.strip().upper() for s in custom_strategies]
    )
    custom_by_label = {s.label.strip().upper(): s for s in custom_strategies}
    for label in labels:
        if label not in STRATEGIES:
            raise HTTPException(status_code=400, detail=f"Unsupported lineage label: {label}")
    if len(set(labels)) != len(labels):
        raise HTTPException(status_code=400, detail="Duplicate lineage labels are not allowed.")

    async def create_lineage_with_agent(label: str) -> None:
        custom = custom_by_label.get(label)
        strategy = _resolve_strategy(
            label=label,
            tag=custom.name if custom else None,
            description=custom.description if custom else None,
            style=custom.style if custom else None,
            temperature=custom.temperature if custom else None,
        )
        await _create_lineage_and_initial_artifact(
            session_id=session.id,
            need=session.need,
            constraints=session.constraints,
            input_prompt=session.input_prompt,
            label=label,
            strategy=strategy,
            model=model,
        )

    try:
        await asyncio.gather(*[create_lineage_with_agent(label) for label in labels])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to create session: {exc}") from exc

    snapshot = STORE.build_session_snapshot(session.id)
    if snapshot is None:
        raise HTTPException(status_code=500, detail="Session created but snapshot could not be loaded.")
    return snapshot


@app.post("/api/sessions/{session_id}/lineages")
async def add_lineage(
    session_id: str, request: AddLineageRequest
) -> dict[str, Any]:
    session = STORE.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found.")

    label = request.label.strip().upper()
    if label not in STRATEGIES:
        raise HTTPException(status_code=400, detail=f"Unsupported lineage label: {label}")
    if STORE.get_lineage_by_label(session_id, label) is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Lineage {label} already exists in session {session_id}.",
        )

    model = _resolve_runtime_model(request.model)
    strategy = _resolve_strategy(
        label=label,
        tag=request.strategy_tag,
        description=request.strategy_description,
        style=request.strategy_style,
        temperature=request.temperature,
    )
    await _create_lineage_and_initial_artifact(
        session_id=session.id,
        need=session.need,
        constraints=session.constraints,
        input_prompt=session.input_prompt,
        label=label,
        strategy=strategy,
        model=model,
    )

    snapshot = STORE.build_session_snapshot(session_id)
    if snapshot is None:
        raise HTTPException(status_code=500, detail="Lineage added but session could not be loaded.")
    return snapshot


@app.post("/api/sessions/{session_id}/run")
async def run_lineage(session_id: str, request: RunLineageRequest) -> dict[str, Any]:
    session = STORE.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found.")

    label = request.lineage_label.strip().upper()
    lineage = STORE.get_lineage_by_label(session_id, label)
    if lineage is None:
        raise HTTPException(status_code=404, detail=f"Lineage {label} not found in session {session_id}.")

    latest_agent = STORE.get_latest_agent(lineage["id"])
    if latest_agent is None:
        raise HTTPException(status_code=400, detail=f"Lineage {label} has no agent.")

    model = _resolve_runtime_model(request.model or latest_agent["parameters"].get("model"))
    user_input = request.input.strip()
    output, duration_ms = await _execute_agent(
        model=model,
        system_prompt=latest_agent["systemPrompt"],
        user_input=user_input,
        temperature=float(latest_agent["parameters"].get("temperature", 0.7)),
        max_tokens=int(latest_agent["parameters"].get("maxTokens", 2048)),
    )

    latest_artifact = STORE.get_latest_artifact(lineage["id"])
    cycle = (latest_artifact["cycle"] + 1) if latest_artifact else 1
    artifact = STORE.create_artifact(
        lineage_id=lineage["id"],
        cycle=cycle,
        content=output,
        metadata={
            "agentId": latest_agent["id"],
            "agentVersion": latest_agent["version"],
            "executionSuccess": True,
            "executionTimeMs": duration_ms,
            "inputUsed": user_input,
        },
    )

    return {
        "artifact": artifact,
        "lineageLabel": label,
        "sessionId": session_id,
    }


@app.post("/api/artifacts/{artifact_id}/evaluate")
async def evaluate_artifact(
    artifact_id: str, request: EvaluateArtifactRequest
) -> dict[str, Any]:
    artifact = STORE.get_artifact(artifact_id)
    if artifact is None:
        raise HTTPException(status_code=404, detail=f"Artifact {artifact_id} not found.")

    evaluation = STORE.upsert_evaluation(
        artifact_id=artifact_id,
        score=request.score,
        comment=request.comment.strip() if request.comment else None,
    )
    return {"evaluation": evaluation}


@app.post("/api/sessions/{session_id}/iterate")
async def iterate_session(
    session_id: str, request: IterateSessionRequest
) -> dict[str, Any]:
    session = STORE.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found.")

    model = _resolve_runtime_model(request.model)
    input_used = _default_input_prompt(session.need, session.input_prompt)
    lineages = STORE.list_lineages(session_id)
    regenerated: list[str] = []

    for lineage in lineages:
        if lineage["isLocked"]:
            continue

        latest_agent = STORE.get_latest_agent(lineage["id"])
        latest_artifact = STORE.get_latest_artifact(lineage["id"])
        if latest_agent is None or latest_artifact is None:
            continue

        latest_evaluation = STORE.get_evaluation_for_artifact(latest_artifact["id"])
        if latest_evaluation is None:
            continue

        evolved_prompt = await _evolve_system_prompt(
            model=model,
            current_prompt=latest_agent["systemPrompt"],
            score=int(latest_evaluation["score"]),
            comment=latest_evaluation.get("comment"),
            sticky=lineage["directiveSticky"] or [],
            oneshot=lineage["directiveOneshot"] or [],
        )

        next_version = int(latest_agent["version"]) + 1
        evolved_agent = STORE.create_agent(
            lineage_id=lineage["id"],
            version=next_version,
            name=str(latest_agent["name"]),
            description=str(latest_agent["description"] or ""),
            system_prompt=evolved_prompt.strip(),
            parameters={
                **latest_agent["parameters"],
                "model": model,
            },
        )

        output, duration_ms = await _execute_agent(
            model=model,
            system_prompt=evolved_agent["systemPrompt"],
            user_input=input_used,
            temperature=float(evolved_agent["parameters"].get("temperature", 0.7)),
            max_tokens=int(evolved_agent["parameters"].get("maxTokens", 2048)),
        )

        STORE.create_artifact(
            lineage_id=lineage["id"],
            cycle=int(latest_artifact["cycle"]) + 1,
            content=output,
            metadata={
                "agentId": evolved_agent["id"],
                "agentVersion": evolved_agent["version"],
                "executionSuccess": True,
                "executionTimeMs": duration_ms,
                "inputUsed": input_used,
            },
        )

        STORE.clear_oneshot_directives(lineage["id"])
        regenerated.append(str(lineage["label"]))

    snapshot = STORE.build_session_snapshot(session_id)
    if snapshot is None:
        raise HTTPException(status_code=500, detail="Failed to load session after iteration.")

    return {
        **snapshot,
        "regeneratedLabels": regenerated,
    }


@app.post("/api/sessions/{session_id}/lineages/{label}/lock")
async def set_lineage_lock(
    session_id: str, label: str, request: SetLineageLockRequest
) -> dict[str, Any]:
    lineage = STORE.get_lineage_by_label(session_id, label.strip().upper())
    if lineage is None:
        raise HTTPException(status_code=404, detail=f"Lineage {label} not found.")

    STORE.set_lineage_locked(lineage["id"], request.is_locked)
    updated = STORE.get_lineage_by_label(session_id, label.strip().upper())
    return {"lineage": updated}


@app.post("/api/sessions/{session_id}/lineages/{label}/directives")
async def update_lineage_directives(
    session_id: str,
    label: str,
    request: UpdateLineageDirectivesRequest,
) -> dict[str, Any]:
    lineage = STORE.get_lineage_by_label(session_id, label.strip().upper())
    if lineage is None:
        raise HTTPException(status_code=404, detail=f"Lineage {label} not found.")

    provided = request.model_fields_set
    if not provided:
        raise HTTPException(status_code=400, detail="No directive updates provided.")

    sticky: list[str] | None = None
    oneshot: list[str] | None = None
    if "directive_sticky" in provided:
        sticky = [d.strip() for d in (request.directive_sticky or []) if d.strip()]
    if "directive_oneshot" in provided:
        oneshot = [d.strip() for d in (request.directive_oneshot or []) if d.strip()]

    STORE.update_lineage_directives(
        lineage["id"],
        sticky=sticky,
        oneshot=oneshot,
    )
    updated = STORE.get_lineage_by_label(session_id, label.strip().upper())
    return {"lineage": updated}
