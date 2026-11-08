import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import get_current_user
from app.config import settings

router = APIRouter()

# Requests per user per UTC day. Edit here to change it.
DAILY_LIMIT = 20


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


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
                "messages": [{"role": "user", "content": body.message}],
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
