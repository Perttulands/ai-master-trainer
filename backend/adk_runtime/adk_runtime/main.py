from __future__ import annotations

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
from pydantic import BaseModel, Field


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
    )


SETTINGS = load_settings()
SESSION_SERVICE = InMemorySessionService()


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
    return {"status": "ok"}


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

