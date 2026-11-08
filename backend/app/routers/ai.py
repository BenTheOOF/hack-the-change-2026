from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import get_current_user
from app.config import settings

router = APIRouter()

# Requests per user per UTC day. Edit here to change it.
DAILY_LIMIT = 20


# The assistant gives general guidance only. It is never sent the user's plan, reps, or
# feedback, and it must defer to their physical therapist and stop on any sign of pain.
SYSTEM_PROMPT = (
    "You are the PhysioTrace assistant inside a physiotherapy exercise app. Answer general questions about "
    "exercise technique, warming up, posture, camera setup for the app, and how the app works, in plain, "
    "encouraging language and under 150 words. You do not know the user's condition, plan, or history, and you "
    "cannot see them. Never diagnose, never prescribe new exercises, loads, or medication, and never contradict "
    "their physical therapist; for anything specific to their body or recovery, suggest they ask their therapist. "
    "If they mention pain, swelling, dizziness, numbness, chest pain, or a new injury, tell them to stop exercising "
    "and contact their therapist or a doctor, and in an emergency their local emergency number."
)


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    # Earlier turns of this conversation, kept in the browser only.
    history: list[Turn] = Field(default_factory=list, max_length=10)


@router.post("/ai/chat")
async def chat(body: ChatIn, user: dict = Depends(get_current_user)):
    if not settings.llm_api_key or not settings.llm_base_url or not settings.llm_model:
        raise HTTPException(503, "Set LLM_BASE_URL, LLM_API_KEY and LLM_MODEL in .env")

    async with httpx.AsyncClient(timeout=60) as client:
        # Counts the request before calling the LLM, so failed calls use up the quota too.
        # The secret key goes in the apikey header only, never in Authorization.
        usage = await client.post(
            f"{settings.supabase_url}/rest/v1/rpc/increment_ai_usage",
            headers={"apikey": settings.supabase_secret_key},
            json={"p_user": user["id"]},
        )
        if usage.status_code != 200:
            raise HTTPException(502, "Could not check the daily limit")
        if usage.json() > DAILY_LIMIT:
            raise HTTPException(429, f"Daily limit of {DAILY_LIMIT} requests reached")

        # OpenAI-compatible Chat Completions, which OpenAI, Gemini, OpenRouter, Groq, Mistral and
        # Ollama all accept. The provider is chosen by LLM_BASE_URL. max_tokens is the widely
        # supported limit field; OpenAI's reasoning models want max_completion_tokens instead.
        r = await client.post(
            f"{settings.llm_base_url.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {settings.llm_api_key}"},
            json={
                "model": settings.llm_model,
                "max_tokens": settings.llm_max_tokens,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    *(turn.model_dump() for turn in body.history),
                    {"role": "user", "content": body.message},
                ],
            },
        )
    if r.status_code != 200:
        raise HTTPException(502, "The LLM provider returned an error")
    choices = r.json().get("choices") or []
    content = choices[0].get("message", {}).get("content") if choices else None
    # Some providers return content as a list of parts instead of a string.
    if isinstance(content, list):
        content = "".join(part.get("text", "") for part in content if isinstance(part, dict))
    return {"reply": content or ""}
